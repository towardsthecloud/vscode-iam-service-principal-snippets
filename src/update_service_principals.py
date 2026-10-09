"""Collect literal service principals from AWS trust policies and principal documentation."""

import argparse
import json
import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://docs.aws.amazon.com/IAM/latest/UserGuide/"
SERVICES_PAGE = "reference_aws-services-that-work-with-iam.html"
SOURCES_FILE = Path(__file__).with_name("principal-sources.json")
# The IAM index still links these retired guides (Lex V1 and RoboMaker in 2025,
# Inspector Classic in 2026). Their services no longer accept new policies.
RETIRED_GUIDES = {
    "https://docs.aws.amazon.com/inspector/latest/userguide/inspector_slr.html",
    "https://docs.aws.amazon.com/lex/latest/dg/using-service-linked-roles.html",
    "https://docs.aws.amazon.com/robomaker/latest/dg/using-service-linked-roles.html",
}
LIGHTSAIL_GUIDE = "https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-using-service-linked-roles.html"
PRINCIPAL = re.compile(r"^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.amazonaws\.com(?:\.cn)?$")
REQUIRED = {
    "ec2.amazonaws.com",
    "events.amazonaws.com",
    "lambda.amazonaws.com",
    "states.amazonaws.com",
    "s3.amazonaws.com",
}


def get_soup(url):
    if (
        urlparse(url).scheme != "https"
        or urlparse(url).hostname != "docs.aws.amazon.com"
    ):
        raise ValueError(f"Unexpected documentation URL: {url}")
    retry = Retry(
        total=2, backoff_factor=0.5, status_forcelist=[429, 500, 502, 503, 504]
    )
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=retry))
        response = session.get(url, timeout=(5, 20))
        response.raise_for_status()
        return BeautifulSoup(response.content, "html.parser")


def literal_principal(value):
    return (
        isinstance(value, str)
        and PRINCIPAL.fullmatch(value)
        and not set(value.split("."))
        & {
            "region",
            "servicename",
            "service-name",
            "aws-region",
            "appropriate-service-name",
        }
    )


def scrape_service_principal(url, expected=()):
    soup = get_soup(url)
    principals = set()
    # Match the Service element inside Principal, never arbitrary endpoint hostnames.
    for block in soup.find_all("pre"):
        text = block.get_text()
        for match in re.finditer(
            r'["\']Principal["\']\s*:\s*\{[^{}]*?["\']Service["\']\s*:\s*(\[[^\]]*\]|["\'][^"\']*["\'])',
            text,
        ):
            for value in re.findall(r'["\']([^"\']+)["\']', match.group(1)):
                if literal_principal(value):
                    principals.add(value)
    for paragraph in soup.find_all("p"):
        description = " ".join(paragraph.get_text(" ", strip=True).lower().split())
        if "service principal" in description or (
            "trust" in description and "assume" in description
        ):
            principal_text = paragraph.get_text(" ", strip=True)
            principal_text += " " + " ".join(
                code.get_text(strip=True) for code in paragraph.find_all("code")
            )
            if "following service" in description:
                following = paragraph.find_next_sibling()
                if following is not None and (
                    following.name == "ul" or following.find("ul") is not None
                ):
                    principal_text += " " + following.get_text(" ", strip=True)
                    principal_text += " " + " ".join(
                        code.get_text(strip=True) for code in following.find_all("code")
                    )
            for value in re.findall(
                r"\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.amazonaws\.com(?:\.cn)?)(?![\w-]|\.[\w])",
                principal_text,
            ):
                if literal_principal(value):
                    principals.add(value)
    # Supplementary pages are curated references for common service roles.
    # Keep their principals only while the literal name remains in the source.
    content = soup.get_text(" ", strip=True)
    for principal in expected:
        if re.search(r"(?<![\w.-])" + re.escape(principal) + r"(?![\w.-])", content):
            principals.add(principal)
    return principals


def scrape_services():
    soup = get_soup(urljoin(BASE_URL, SERVICES_PAGE))
    table = soup.find("table")
    if table is None:
        raise ValueError("AWS IAM services table is missing")
    header = table.find("tr")
    headings = [
        cell.get_text(" ", strip=True).lower() for cell in header.find_all(["td", "th"])
    ]
    try:
        column = headings.index("service-linked roles")
    except ValueError as error:
        raise ValueError("AWS IAM services table has changed") from error
    services = {}
    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) <= column:
            continue
        for link in cells[column].find_all("a", href=True):
            if link.get_text(strip=True).lower() in {"yes", "partial"}:
                url = urljoin(BASE_URL, link["href"])
                if url in RETIRED_GUIDES:
                    continue
                if urlparse(url).hostname == "lightsail.aws.amazon.com":
                    url = LIGHTSAIL_GUIDE
                services[url] = cells[0].get_text(" ", strip=True)
    if not services:
        raise ValueError("AWS IAM services table contains no documentation links")
    return services


def scrape_service_principals(num_workers, previous):
    services = scrape_services()
    # Preserve coverage when the IAM index changes which guide it links to.
    for record in previous.values():
        for url in record.get("reference_urls", [record.get("reference_url", "")]):
            if (
                urlparse(url).hostname == "docs.aws.amazon.com"
                and url not in RETIRED_GUIDES
            ):
                services.setdefault(
                    url, record.get("originalNames", ["AWS service"])[0]
                )
    required_sources = json.loads(SOURCES_FILE.read_text())
    services.update({url: "AWS trust policy" for url in required_sources})
    records = {}
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {
            executor.submit(
                scrape_service_principal, url, required_sources.get(url, [])
            ): url
            for url in sorted(services)
        }
        for future in as_completed(futures):
            url = futures[future]
            principals = (
                future.result()
            )  # A failed source aborts the update before any write.
            missing = set(required_sources.get(url, [])) - principals
            if missing:
                raise ValueError(
                    f"Documented principals disappeared from {url}: {sorted(missing)}"
                )
            for principal in principals:
                record = records.setdefault(
                    principal,
                    {
                        "servicePrincipal": principal,
                        "reference_urls": set(),
                        "originalNames": set(),
                        "sources": ["documentation"],
                    },
                )
                record["reference_urls"].add(url)
                record["originalNames"].add(services[url])
    for record in records.values():
        record["reference_urls"] = sorted(record["reference_urls"])
        record["reference_url"] = record["reference_urls"][0]
        record["originalNames"] = sorted(record["originalNames"])
    return dict(sorted(records.items()))


def validate_catalog(data):
    if not isinstance(data, dict) or not data:
        raise ValueError("Catalog must be a nonempty object")
    for key, record in data.items():
        if (
            not isinstance(record, dict)
            or key != record.get("servicePrincipal")
            or not literal_principal(key)
        ):
            raise ValueError(f"Invalid principal record: {key}")
        urls = record.get("reference_urls")
        if (
            not isinstance(urls, list)
            or not urls
            or urls != sorted(set(urls))
            or any(
                urlparse(url).scheme != "https"
                or urlparse(url).hostname != "docs.aws.amazon.com"
                for url in urls
            )
        ):
            raise ValueError(f"Principal has no valid documentation references: {key}")
        if (
            record.get("sources") != ["documentation"]
            or record.get("reference_url") != urls[0]
        ):
            raise ValueError(f"Invalid provenance: {key}")
        names = record.get("originalNames")
        if (
            not isinstance(names, list)
            or not names
            or any(not isinstance(name, str) or not name for name in names)
        ):
            raise ValueError(f"Invalid service names: {key}")
    missing = REQUIRED - data.keys()
    if missing:
        raise ValueError(f"Required principals missing: {sorted(missing)}")


def write_catalog(output, records, allow_removals):
    validate_catalog(records)
    if output.exists() and not allow_removals:
        previous = json.loads(output.read_text())
        removed = {
            record["servicePrincipal"] for record in previous.values()
        } - records.keys()
        if removed:
            raise ValueError(
                f"Refusing to remove {len(removed)} principals. Review the diff and rerun with --allow-removals if intentional."
            )
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=output.parent, delete=False
        ) as handle:
            temporary = Path(handle.name)
            handle.write(json.dumps(records, indent=2, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path("snippets/service-principals.json")
    )
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate the existing catalog without network access",
    )
    parser.add_argument(
        "--allow-removals",
        action="store_true",
        help="Allow reviewed removals from an existing catalog",
    )
    args = parser.parse_args()
    if not 1 <= args.workers <= 32:
        parser.error("--workers must be between 1 and 32")
    try:
        if args.check:
            records = json.loads(args.output.read_text())
            validate_catalog(records)
        else:
            previous = (
                json.loads(args.output.read_text()) if args.output.exists() else {}
            )
            records = scrape_service_principals(args.workers, previous)
            write_catalog(args.output, records, args.allow_removals)
    except (
        requests.RequestException,
        ValueError,
        OSError,
        KeyError,
        TypeError,
    ) as error:
        parser.exit(1, f"Catalog update failed: {error}\n")
    print(f"Validated {len(records)} documented service principals in {args.output}")


if __name__ == "__main__":
    main()
