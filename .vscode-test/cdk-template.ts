import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export class TestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const testRole = new iam.Role(this, 'testRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    const snsKey = new kms.Key(this, 'snsTopicKey', {
      enableKeyRotation: true,
      alias: 'snsTopicKey',
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['kms:Decrypt', 'kms:GenerateDataKey*', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:DescribeKey'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
            principals: [
              new iam.ServicePrincipal('cloudwatch.amazonaws.com'),
              new iam.ServicePrincipal('sns.amazonaws.com'),
              new iam.ServicePrincipal(''),
            ],
          }),
          new iam.PolicyStatement({
            actions: ['kms:*'],
            resources: ['*'],
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
          }),
        ],
      }),
    });

    const testPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sagemaker:DeleteApp',
        'sagemaker:DeleteSpace',
        'sagemaker:DescribeApp',
        'sagemaker:DescribeSpace',
        'sagemaker:CreateEndpoint',
      ],
      resources: ['*'],
      principal: new iam.Principal('access-analyzer.amazonaws.com'),
    });
    testRole.addToPolicy(testPolicy);
  }
}
