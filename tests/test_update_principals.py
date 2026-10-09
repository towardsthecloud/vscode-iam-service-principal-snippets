"""Exercise the updater CLI with AWS HTTP responses controlled at the network boundary."""

import contextlib
import io
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

SCRIPT = Path(__file__).resolve().parents[1] / "src/update_service_principals.py"
TABLE = """<table><tr><th>Service</th><th>Actions</th><th>Resources</th><th>Resource policies</th><th>ABAC</th><th>Temporary</th><th>Service-linked roles</th></tr>
<tr><td>Example</td><td>Yes</td><td>Yes</td><td>No</td><td>No</td><td>Yes</td><td><a href="https://docs.aws.amazon.com/example/roles.html">Yes</a></td></tr></table>"""
DOCUMENT = """<p>These are AWS service principals:</p><pre>{"Principal":{"Service":["end-user-messaging.amazonaws.com","ec2.amazonaws.com","ec2.application-autoscaling.amazonaws.com","events.amazonaws.com","events.workmail.amazonaws.com","lambda.amazonaws.com","states.amazonaws.com","s3.amazonaws.com","ec2.amazonaws.com.cn","delivery.logs.amazonaws.com","sns.amazonaws.com","sqs.amazonaws.com","cloudformation.amazonaws.com","elasticache.amazonaws.com","memorydb.amazonaws.com","license-manager-user-subscriptions.amazonaws.com","qbusiness.amazonaws.com","sso.amazonaws.com","ecs-tasks.amazonaws.com","codebuild.amazonaws.com","codepipeline.amazonaws.com","glue.amazonaws.com","sagemaker.amazonaws.com","scheduler.amazonaws.com","backup.amazonaws.com","backup-gateway.amazonaws.com","codedeploy.amazonaws.com","firehose.amazonaws.com","ecs.amazonaws.com","elasticloadbalancing.amazonaws.com"]}}</pre>"""


class UpdaterTests(unittest.TestCase):
    def run_cli(self, output, *arguments, failing_url=None, document=DOCUMENT):
        def request(session, method, url, **kwargs):
            if failing_url and failing_url in url:
                raise requests.Timeout("simulated timeout")
            response = requests.Response()
            response.status_code = 200
            response.url = url
            if "reference_aws-services-that-work-with-iam" in url:
                content = TABLE
            elif "policies.js" in url:
                content = "app.PolicyEditorConfig=" + json.dumps(
                    {"serviceMap": {"EC2": {"StringPrefix": "ec2"}}}
                )
            else:
                content = document
            response._content = content.encode()
            return response

        with (
            contextlib.chdir(output.parent.parent),
            patch.object(requests.Session, "request", request),
            patch("sys.argv", [str(SCRIPT), "--output", str(output), *arguments]),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            runpy.run_path(str(SCRIPT), run_name="__main__")

    def test_keeps_distinct_documented_principals_and_china_suffix(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            self.run_cli(output)
            records = json.loads(output.read_text())
            values = {record["servicePrincipal"] for record in records.values()}
            self.assertTrue(
                {
                    "ec2.amazonaws.com",
                    "ec2.application-autoscaling.amazonaws.com",
                    "events.amazonaws.com",
                    "events.workmail.amazonaws.com",
                    "ec2.amazonaws.com.cn",
                }
                <= values
            )

    def test_source_timeout_preserves_existing_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            self.run_cli(output)
            original = output.read_bytes()
            with self.assertRaises(SystemExit) as failure:
                self.run_cli(output, failing_url="example/roles")
            self.assertEqual(failure.exception.code, 1)
            self.assertEqual(output.read_bytes(), original)

    def test_removals_require_review_and_explicit_override(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            self.run_cli(output)
            original = output.read_bytes()
            changed = DOCUMENT.replace('"events.workmail.amazonaws.com",', "")
            with self.assertRaises(SystemExit):
                self.run_cli(output, document=changed)
            self.assertEqual(output.read_bytes(), original)
            self.run_cli(output, "--allow-removals", document=changed)
            self.assertNotIn(
                "events.workmail.amazonaws.com", json.loads(output.read_text())
            )
            self.run_cli(output, "--check")

    def test_ignores_endpoints_unrelated_service_keys_and_placeholders(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            changed = (
                DOCUMENT
                + '<p>Endpoint: <code>example.amazonaws.com</code></p><pre>{"Service":"fake.amazonaws.com"}</pre><pre>{"Principal":{"Service":"logs.region.amazonaws.com"}}</pre>'
            )
            self.run_cli(output, document=changed)
            values = {
                record["servicePrincipal"]
                for record in json.loads(output.read_text()).values()
            }
            self.assertFalse(
                values
                & {
                    "example.amazonaws.com",
                    "fake.amazonaws.com",
                    "logs.region.amazonaws.com",
                }
            )

    def test_reads_singular_and_plural_trust_lists(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            changed = (
                DOCUMENT
                + """<p>The role trusts the following
 service to assume it:</p>
<div><ul><li><p>vpc-lattice.amazonaws.com</p></li></ul></div>
<p>The role trusts the following
 services to assume it:</p>
<ul><li><code>codebuild.amazonaws.com</code></li></ul>
<p>The service principal is <code><span>dynamodb.application-autoscaling</span>.amazonaws.com</code>.</p>"""
            )
            self.run_cli(output, document=changed)
            self.assertTrue(
                {"vpc-lattice.amazonaws.com", "codebuild.amazonaws.com", "dynamodb.application-autoscaling.amazonaws.com"}
                <= json.loads(output.read_text()).keys()
            )

    def test_parallel_fetching_produces_identical_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            self.run_cli(output, "--workers", "1")
            original = output.read_bytes()
            self.run_cli(output, "--workers", "8")
            self.assertEqual(output.read_bytes(), original)

    def test_failed_replace_keeps_original_file_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            self.run_cli(output)
            original = output.read_bytes()
            with (
                patch("os.replace", side_effect=OSError("simulated disk failure")),
                self.assertRaises(SystemExit),
            ):
                self.run_cli(output)
            self.assertEqual(output.read_bytes(), original)
            self.assertEqual(list(output.parent.iterdir()), [output])

    def test_offline_check_rejects_unverified_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snippets/principals.json"
            self.run_cli(output)
            records = json.loads(output.read_text())
            records["ec2.amazonaws.com"]["sources"] = ["policy_generator"]
            output.write_text(json.dumps(records))
            with self.assertRaises(SystemExit):
                self.run_cli(output, "--check")


if __name__ == "__main__":
    unittest.main()
