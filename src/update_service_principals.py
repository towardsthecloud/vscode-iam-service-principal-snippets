import argparse
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# Constants
BASE_URL = "https://docs.aws.amazon.com/IAM/latest/UserGuide/"
SERVICES_PAGE = "reference_aws-services-that-work-with-iam.html"


def parse_arguments():
    parser = argparse.ArgumentParser(description="Scrape service principals from AWS documentation")
    parser.add_argument(
        "--output",
        dest="output_file",
        default="service-principals.json",
        help="Output file name (default: %(default)s)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=10,
        help="Number of worker threads for parallel scraping (default: 10)",
    )
    return parser.parse_args()


def get_soup(url):
    response = requests.get(url)
    response.raise_for_status()
    return BeautifulSoup(response.content, "html.parser")


def scrape_service_principal(service_url):
    try:
        soup = get_soup(service_url)
        service_principal = None

        # Find the service principal
        for p in soup.find_all("p"):
            if "amazonaws.com" in p.text:
                service_principal_text = p.text.strip()
                pattern = r"(?:trusts the|allows the|assumes the|arn:aws:iam::\*:role/aws-service-role/)?\s*([a-z0-9.-]+\.amazonaws\.com)"
                match = re.search(pattern, service_principal_text, re.IGNORECASE)
                if match:
                    service_principal = match.group(1)
                    break

        return service_principal, service_url
    except Exception as e:
        print(f"Error scraping {service_url}: {str(e)}")
        return None, None


def fetch_policy_generator_principals():
    """Fetch service principals from AWS Policy Generator matching bash command output."""
    url = "https://awspolicygen.s3.amazonaws.com/js/policies.js"
    max_retries = 3

    for attempt in range(max_retries):
        try:
            # Fetch data
            response = requests.get(url)
            response.raise_for_status()

            # Extract JSON (similar to sed command)
            json_content = response.text.split("app.PolicyEditorConfig=")[1].rsplit("}", 1)[0] + "}"

            # Parse JSON
            data = json.loads(json_content)

            # Extract principals (similar to jq command)
            service_principals = {}
            unique_principals = set()

            for service in data["serviceMap"].values():
                if service.get("StringPrefix"):
                    prefix = service["StringPrefix"]
                    principal = f"{prefix}.amazonaws.com"
                    unique_principals.add(principal)

                    service_name = service.get("name", prefix)
                    service_principals[service_name] = {"servicePrincipal": principal, "reference_url": url}

            print(f"Debug: Found {len(unique_principals)} unique principals")
            return service_principals

        except requests.RequestException as e:
            if attempt == max_retries - 1:
                print(f"Failed to fetch after {max_retries} attempts: {e}")
                return {}
            time.sleep(1)
            continue
        except json.JSONDecodeError as e:
            print(f"JSON parsing error: {e}")
            print(f"Content start: {json_content[:200]}")
            return {}
        except Exception as e:
            print(f"Unexpected error: {e}")
            return {}


def normalize_service_name(name):
    """Normalize service name for comparison."""
    # Remove common prefixes and whitespace
    name = name.lower().strip()
    name = re.sub(r"^(amazon\s+|aws\s+)", "", name)
    # Remove special characters and spaces
    name = re.sub(r"[^a-z0-9]", "", name)
    return name


def merge_service_principals(doc_principals, policy_principals):
    """Merge service principals, preferring documentation records but combining sources."""
    merged = {}

    # Merge documentation principals first
    for doc_name, doc_data in doc_principals.items():
        doc_normalized = normalize_service_name(doc_name)
        principal = doc_data["servicePrincipal"]
        service_name = principal.split(".")[0]  # Extract service name from servicePrincipal
        if service_name not in merged:
            merged[service_name] = doc_data
            merged[service_name]["sources"] = ["documentation"]
            merged[service_name]["originalNames"] = [doc_name]
        else:
            merged[service_name]["originalNames"].append(doc_name)

    # Add or update policy generator principals
    for policy_name, policy_data in policy_principals.items():
        policy_normalized = normalize_service_name(policy_name)
        principal = policy_data["servicePrincipal"]
        service_name = principal.split(".")[0]  # Extract service name from servicePrincipal
        if service_name not in merged:
            merged[service_name] = policy_data
            merged[service_name]["sources"] = ["policy_generator"]
            merged[service_name]["originalNames"] = [policy_name]
        else:
            merged[service_name]["sources"].append("policy_generator")
            merged[service_name]["originalNames"].append(policy_name)

    return merged


def scrape_services():
    soup = get_soup(urljoin(BASE_URL, SERVICES_PAGE))
    table = soup.find("table")
    if not table:
        return {}

    services = {}
    for row in table.find_all("tr")[1:]:  # Skip header row
        cells = row.find_all("td")
        if len(cells) >= 7:
            service_name = cells[0].text.strip()
            service_linked_role_cell = cells[6]
            service_linked_role_link = service_linked_role_cell.find("a")
            if service_linked_role_link and service_linked_role_link.text.strip().lower() == "yes":
                service_url = urljoin(BASE_URL, service_linked_role_link["href"])
                services[service_name] = service_url

    return services


def scrape_service_principals(num_workers=10):
    services = scrape_services()

    service_principals = {}
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        future_to_service = {executor.submit(scrape_service_principal, url): name for name, url in services.items()}
        for future in as_completed(future_to_service):
            service_name = future_to_service[future]
            try:
                service_principal, reference_url = future.result()
                if service_principal:
                    prefix_name = normalize_service_name(service_name)
                    service_principals[prefix_name] = {
                        "servicePrincipal": service_principal,
                        "reference_url": reference_url,
                    }
            except Exception as exc:
                print(f"{service_name} generated an exception: {exc}")

    return service_principals


def main():
    args = parse_arguments()

    # Get service principals from both sources
    scraped_principals = scrape_service_principals(num_workers=args.workers)
    policy_principals = fetch_policy_generator_principals()

    # Merge results with enhanced logic
    all_principals = merge_service_principals(scraped_principals, policy_principals)

    # Write results
    snippets_path = os.path.abspath("snippets")
    os.makedirs(snippets_path, exist_ok=True)
    output_file = os.path.join(snippets_path, os.path.basename(args.output_file))

    with open(output_file, "w") as f:
        json.dump(all_principals, f, indent=2, sort_keys=True)

    print(f"Found {len(all_principals)} service principals:")
    print(f"- Documentation only: {sum(1 for p in all_principals.values() if p['sources'] == ['documentation'])}")
    print(f"- Policy Generator only: {sum(1 for p in all_principals.values() if p['sources'] == ['policy_generator'])}")
    print(f"- Both sources: {sum(1 for p in all_principals.values() if len(p['sources']) > 1)}")
    print(f"\nResults saved to {output_file}")


if __name__ == "__main__":
    main()
