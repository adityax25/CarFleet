output "state_bucket" {
  description = "S3 bucket that holds Terraform state for every stack."
  value       = aws_s3_bucket.state.bucket
}

output "region" {
  description = "Region of the state bucket."
  value       = var.region
}
