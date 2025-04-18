from aws_cdk import (
    Stack,
)
from aws_cdk import (
    aws_iam as iam,
    aws_kms as kms,
)
from constructs import Construct


class MyStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        sns_key = kms.Key(self, "snsTopicKey",
            enable_key_rotation=True,
            alias="snsTopicKey",
            policy=iam.PolicyDocument(
                statements=[
                    iam.PolicyStatement(
                        actions=["kms:Decrypt", "kms:GenerateDataKey*", "kms:Encrypt", "kms:ReEncrypt*", "kms:DescribeKey"],
                        resources=["*"],
                        effect=iam.Effect.ALLOW,
                        principals=[
                            iam.ServicePrincipal("cloudwatch.amazonaws.com"),
                            iam.ServicePrincipal("sns.amazonaws.com"),
                            iam.ServicePrincipal(""),
                        ]
                    ),
                    iam.PolicyStatement(
                        actions=["kms:*"],
                        resources=["*"],
                        effect=iam.Effect.ALLOW,
                        principals=[iam.AccountRootPrincipal()]
                    )
                ]
            )
        )

        test_role = iam.Role(self, "testRole", assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"))

        test_policy = iam.PolicyStatement(
            actions=[
                "sagemaker:DeleteApp",
                "sagemaker:DeleteSpace",
            ],
            resources=["*"],
            effect=iam.Effect.ALLOW,
            principal=iam.ServicePrincipal("a2c.amazonaws.com"),
        )
        test_role.add_to_principal_policy(test_policy)
