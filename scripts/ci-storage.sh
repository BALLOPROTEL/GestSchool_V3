#!/bin/sh
# Run from the repository root. Dedicated, disposable CI storage only.
set -eu

storage_container=${CI_STORAGE_CONTAINER:-gestschool-ci-minio}
storage_port=${CI_STORAGE_PORT:-9000}
storage_bind=${CI_STORAGE_BIND:-127.0.0.1}
storage_tag=gestschool-ci-storage:9e49d5e7a648-7394ce0dd2a8

# Always contact the registries and compile both official sources from scratch.
# The context contains only this Dockerfile, never application data or .local.
docker build --pull --no-cache --progress=plain --tag "$storage_tag" docker/ci-storage
storage_image=$(docker image inspect --format '{{.Id}}' "$storage_tag")
docker run --pull=never --detach --name "$storage_container" \
  --publish "$storage_bind:$storage_port:9000" \
  --env MINIO_ROOT_USER=gestschool-local \
  --env MINIO_ROOT_PASSWORD=gestschool-local-secret \
  "$storage_image"

storage_endpoint="http://127.0.0.1:$storage_port"
attempt=0
until curl --fail --silent --show-error "$storage_endpoint/minio/health/live"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'Private storage readiness failed' >&2
    exit 1
  fi
  sleep 1
done

# mc is built into the same image: no second registry or mutable client tag.
docker exec "$storage_container" sh -ec '
  minio --version
  mc --version
  mc alias set ci http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc mb ci/gestschool-local-private
  mc anonymous set none ci/gestschool-local-private
  printf "gestschool-ci-private-probe\n" | mc pipe ci/gestschool-local-private/.ci-private-probe
  mc stat ci/gestschool-local-private/.ci-private-probe
  test "$(mc cat ci/gestschool-local-private/.ci-private-probe)" = gestschool-ci-private-probe
'

# Check both listing and an existing object; a missing-object 404 is not proof.
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "$storage_endpoint/gestschool-local-private")" = 403
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "$storage_endpoint/gestschool-local-private/.ci-private-probe")" = 403
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --request PUT --data 'anonymous-write-must-fail' \
  "$storage_endpoint/gestschool-local-private/.ci-private-probe")" = 403
docker exec "$storage_container" sh -ec '
  test "$(mc cat ci/gestschool-local-private/.ci-private-probe)" = gestschool-ci-private-probe
  mc rm ci/gestschool-local-private/.ci-private-probe
'
echo 'private storage startup = PASS'
echo 'bucket creation = PASS'
echo 'anonymous access = disabled (listing, existing object read and write: HTTP 403)'
