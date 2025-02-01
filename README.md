# AWS IAM Service Principal Snippets for VS Code

[![](https://img.shields.io/visual-studio-marketplace/v/dannysteenman.iam-service-principal-snippets?color=374151&label=Visual%20Studio%20Marketplace&labelColor=000&logo=visual-studio-code&logoColor=0098FF)](https://marketplace.visualstudio.com/items?itemName=dannysteenman.iam-service-principal-snippets)
[![](https://img.shields.io/visual-studio-marketplace/v/dannysteenman.iam-service-principal-snippets?color=374151&label=Open%20VSX%20Registry&labelColor=000&logo=data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyB2aWV3Qm94PSI0LjYgNSA5Ni4yIDEyMi43IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgogIDxwYXRoIGQ9Ik0zMCA0NC4yTDUyLjYgNUg3LjN6TTQuNiA4OC41aDQ1LjNMMjcuMiA0OS40em01MSAwbDIyLjYgMzkuMiAyMi42LTM5LjJ6IiBmaWxsPSIjYzE2MGVmIi8+CiAgPHBhdGggZD0iTTUyLjYgNUwzMCA0NC4yaDQ1LjJ6TTI3LjIgNDkuNGwyMi43IDM5LjEgMjIuNi0zOS4xem01MSAwTDU1LjYgODguNWg0NS4yeiIgZmlsbD0iI2E2MGVlNSIvPgo8L3N2Zz4=&logoColor=0098FF)](https://open-vsx.org/extension/dannysteenman/iam-service-principal-snippets)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/dannysteenman.iam-service-principal-snippets 'Currently Installed')](https://marketplace.visualstudio.com/items?itemName=dannysteenman.iam-service-principal-snippets)
[![Rating](https://img.shields.io/visual-studio-marketplace/stars/dannysteenman.iam-service-principal-snippets)](https://marketplace.visualstudio.com/items?itemName=dannysteenman.iam-service-principal-snippets)

This VS Code extension provides autocompletion of all AWS services that can be used as Service Principals in your IAM policies.

> [!TIP]
> Struggling with AWS complexity or stuck on-premise? Let's transform your cloud journey.
>
> [Schedule a call with me](https://towardsthecloud.com/contact) to find out how I can enhance your existing AWS setup or guide your journey from on-premise to the Cloud.
>
> <details><summary>☁️ <strong>Discover more about my one-person business: Towards the Cloud</strong></summary>
>
> <br/>
>
> Hi, I'm Danny – AWS expert and founder of [Towards the Cloud](https://towardsthecloud.com). With over a decade of hands-on experience, I specialized myself in deploying well-architected, highly scalable and cost-effective AWS Solutions using Infrastructure as Code (IaC).
>
> #### When you work with me, you're getting a package deal of expertise and personalized service:
>
> - **AWS CDK Proficiency**: I bring deep AWS CDK knowledge to the table, ensuring your infrastructure is not just maintainable and scalable, but also fully automated.
> - **AWS Certified**: [Equipped with 7 AWS Certifications](https://www.credly.com/users/dannysteenman/badges), including DevOps Engineer & Solutions Architect Professional, to ensure best practices across diverse cloud scenarios.
> - **Direct Access**: You work with me, not a team of managers. Expect quick decisions and high-quality work.
> - **Tailored Solutions**: Understanding that no two businesses are alike, I Custom-fit cloud infrastructure for your unique needs.
> - **Cost-Effective**: I'll optimize your AWS spending without cutting corners on performance or security.
> - **Seamless CI/CD**: I'll set up smooth CI/CD processes using GitHub Actions, making changes a breeze through Pull Requests.
>
> *My mission is simple: I'll free you from infrastructure headaches so you can focus on what truly matters – your core business.*
>
> Ready to unlock the full potential of AWS Cloud?
>
> <a href="https://towardsthecloud.com/contact"><img alt="Schedule your call" src="https://img.shields.io/badge/schedule%20your%20call-success.svg?style=for-the-badge"/></a>
> </details>

---

## Features

1. **Auto-completion for AWS Service Principals**: Provides intelligent auto-completion suggestions for AWS Service Principals when defining IAM policies or roles.
2. **Context-aware Suggestions**: The extension intelligently detects when you're working with IAM policies or roles and only suggests Service Principal completions in relevant contexts.
3. **Supports Multiple Languages**: Supports auto-completion for Service Principals in JSON, YAML, Terraform, and AWS CDK (TypeScript, and Python).

## Usage

1. Install the "AWS IAM Service Principal Snippets" extension in VS Code.
2. Open or create a new file (`.json`, `.yml`, `.tf`, `.ts`, or `.py`) where you're defining IAM policies or roles.
3. When you reach a point where you need to specify a Service Principal (e.g., `Principal` key in JSON/YAML policies, `assumed_by` parameter in Python roles, etc.), start typing the name of the AWS service.
4. The extension will provide auto-completion suggestions for matching AWS Service Principals.
5. Select the desired Service Principal to insert it into your code.

Example of auto-completion in action:

![IAM Service Principal Snippets Autocomplete Example](https://raw.githubusercontent.com/dannysteenman/vscode-iam-service-principal-snippets/main/images/iam-service-principal-snippets-autocomplete-example.gif)

> **Note:** If auto-completion doesn't trigger automatically, press `Ctrl+Space` (or `Cmd+Space` on macOS) to manually invoke IntelliSense.

---
## Support

If you have a feature request or an issue, please let me know on [Github](https://github.com/dannysteenman/vscode-iam-service-principal-snippets/issues)

## Author

[Danny Steenman](https://towardsthecloud.com/about)

[![](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/dannysteenman)
[![](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/dannysteenman)
[![](https://img.shields.io/badge/GitHub-2b3137?style=for-the-badge&logo=github&logoColor=white)](https://github.com/dannysteenman)
