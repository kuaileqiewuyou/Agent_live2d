## Summary

- 

## Release Impact

- Backend:
- Frontend:
- Desktop (Tauri):
- Docker:

## Linked Release Ticket

- #<issue-id> or full issue URL

## Manual Release Checklist (Before Merge)

- [ ] Linked Release Ticket added in this PR description
- [ ] `python -m pytest -q` passed
- [ ] `npm run test:unit` passed
- [ ] `npm run test:e2e` passed
- [ ] `npm run smoke:release` passed (or used `--skip-e2e` with reason below)
- [ ] `docker compose up --build -d app qdrant` can start successfully
- [ ] `curl.exe -sS http://127.0.0.1:8001/api/health` (or smoke port 18001) returns success=true
- [ ] `docker compose down` cleanup has been executed
- [ ] README / CONTRACT updated if API or runtime behavior changed

## Risk and Rollback

- Risk points:
- Rollback steps:

## Additional Notes

- Skip reason (if any):
- Screenshot / logs (if any):
