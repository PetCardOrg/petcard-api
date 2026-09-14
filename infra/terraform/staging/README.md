# Staging — passo a passo manual

Este stack não é aplicado pelo CI. O workflow de CD (`.github/workflows/cd-staging.yml`)
só builda a imagem, publica no ECR e dispara o deploy — a infraestrutura em si
(VPC, RDS, RabbitMQ, App Runner) é provisionada uma vez, manualmente, por
quem tem acesso à conta AWS.

## 0. Pré-requisitos

- `aws configure` com uma conta que tenha permissão de admin (ou pelo menos
  IAM, VPC, RDS, ECS, ECR, S3, App Runner, SSM, Service Discovery, EFS).
- Terraform >= 1.7 (`brew install hashicorp/tap/terraform` — o `brew install terraform`
  sozinho não funciona mais, a Hashicorp saiu do brew core).

## 1. Bootstrap (uma vez por conta AWS)

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply
```

Anota os outputs `state_bucket`, `lock_table` e `github_oidc_provider_arn` —
usados nos passos seguintes.

## 2. Backend remoto da stack staging

Criar `infra/terraform/staging/backend.hcl` (não versionado, está no `.gitignore`):

```hcl
bucket         = "<state_bucket do passo 1>"
key            = "staging/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "<lock_table do passo 1>"
encrypt        = true
```

## 3. Variáveis sensíveis

Criar `infra/terraform/staging/terraform.tfvars` (também não versionado):

```hcl
github_oidc_provider_arn = "<github_oidc_provider_arn do passo 1>"

db_password       = "..."   # gerar com: openssl rand -base64 24
rabbitmq_password = "..."   # idem
jwt_secret        = "..."   # openssl rand -hex 32 (mínimo 32 chars, exigido em produção)

# SMTP real (ADR-008) — Gmail com senha de app, ou outro provedor sem custo.
smtp_host = "smtp.gmail.com"
smtp_user = "..."
smtp_pass = "..."

cors_origins = "https://<staging do petcard-web quando existir>"
```

## 4. Primeiro apply

```bash
cd infra/terraform/staging
terraform init -backend-config=backend.hcl
terraform apply
```

Isso sobe VPC, RDS, RabbitMQ (Fargate+EFS), ECR, bucket S3 e o App Runner —
mas o App Runner sobe com `API_BASE_URL`/`APP_DEEP_LINK_BASE` em placeholder,
porque a URL dele só existe depois de criado (não dá pra referenciar o
próprio recurso dentro dele mesmo).

## 5. Segundo apply — URL real

```bash
terraform output apprunner_service_url
terraform apply -var="api_base_url=<valor do output acima>"
```

Isso reinicia o serviço do App Runner já com a URL pública correta.

## 6. Habilitar a extensão PostGIS

Não é gerenciável pelo Terraform — rodar uma vez, com um client psql, contra
`terraform output db_endpoint`:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

(A RDS instance não é `publicly_accessible`; rodar isso de uma máquina dentro
da VPC — ex.: uma task Fargate temporária, ou um túnel via SSM Session
Manager — ou, mais simples pra uma vez só, ligar `publicly_accessible = true`
temporariamente, rodar o `CREATE EXTENSION`, desligar de novo.)

## 7. Rodar as migrations do Prisma contra o RDS

Mesma observação de rede do passo 6. Com `DATABASE_URL` apontando pro RDS:

```bash
npx prisma migrate deploy
```

## 8. Configurar o ambiente "staging" no GitHub

```bash
gh api repos/PetCardOrg/petcard-api/environments/staging -X PUT

gh secret set AWS_ROLE_ARN --env staging --body "$(terraform output -raw github_actions_deploy_role_arn)"
gh variable set AWS_REGION --env staging --body "us-east-1"
gh variable set ECR_REPOSITORY --env staging --body "$(terraform output -raw ecr_repository_url)"
gh variable set APPRUNNER_SERVICE_ARN --env staging --body "$(terraform output -raw apprunner_service_arn)"
```

Depois disso, todo merge na `develop` builda, publica no ECR e o App Runner
implanta sozinho (`auto_deployments_enabled = true`).

## Sobre a troca de arquitetura

O DAS (`petcard-docs/docs/das.md`) descreve ECS Fargate + ALB. Esta stack usa
App Runner em vez disso — decisão registrada em ADR (ver
`petcard-docs/architecture/adr/`), motivada por custo e simplicidade
operacional para um ambiente de staging de baixo tráfego. RabbitMQ continua
em Fargate (App Runner não roda workloads sem HTTP), alcançado pelo App
Runner via VPC Connector + Cloud Map.

## Custo aproximado (us-east-1, staging ocioso a maior parte do tempo)

| Recurso                                     | Estimativa mensal       |
| ------------------------------------------- | ----------------------- |
| RDS db.t4g.micro                            | ~US$12                  |
| Fargate (RabbitMQ, 0.25 vCPU/0.5GB, 24/7)   | ~US$9                   |
| EFS (uso baixo)                             | <US$1                   |
| App Runner (0.25 vCPU/0.5GB, tráfego baixo) | ~US$5-15, varia com uso |
| ECR, S3, SSM, CloudWatch logs               | <US$2                   |
| **Total**                                   | **~US$30-40/mês**       |

Sem NAT Gateway (~US$32/mês) nem ALB (~US$16-20/mês) — os dois maiores itens
do plano original ECS Fargate + ALB.
