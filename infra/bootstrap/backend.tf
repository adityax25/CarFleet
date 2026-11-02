# Added after the first apply, once the bucket existed. `terraform init
# -migrate-state` then moved this stack's local state into it.
terraform {
  backend "s3" {
    bucket       = "carfleet-tfstate-721955910245"
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}
