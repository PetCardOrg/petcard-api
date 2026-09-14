resource "aws_ecr_repository" "api" {
  name                 = "${var.project}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Mantém só as 10 imagens mais recentes"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

# Bucket de mídia (fotos de pet/perfil). O bucket de dev/local
# (petcard-uploads-dev, do .env.example) não é este — staging tem o seu.
resource "aws_s3_bucket" "uploads" {
  bucket = "${var.project}-uploads-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_methods = ["GET", "PUT"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

# Usuário técnico dedicado ao upload.service.ts, que hoje exige
# access key/secret explícitos em vez da chain de credenciais do provider
# (não usa a role da task) — refletir isso é escopo de outra issue, não da
# PC-092. Permissão restrita ao próprio bucket.
resource "aws_iam_user" "s3_uploads" {
  name = "${var.project}-s3-uploads"
}

resource "aws_iam_user_policy" "s3_uploads" {
  name = "${var.project}-s3-uploads"
  user = aws_iam_user.s3_uploads.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.uploads.arn
      }
    ]
  })
}

resource "aws_iam_access_key" "s3_uploads" {
  user = aws_iam_user.s3_uploads.name
}

resource "aws_ssm_parameter" "s3_access_key_id" {
  name  = "/${var.project}/aws-access-key-id"
  type  = "SecureString"
  value = aws_iam_access_key.s3_uploads.id
}

resource "aws_ssm_parameter" "s3_secret_access_key" {
  name  = "/${var.project}/aws-secret-access-key"
  type  = "SecureString"
  value = aws_iam_access_key.s3_uploads.secret
}
