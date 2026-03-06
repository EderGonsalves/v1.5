@echo off
cd /d "C:\Users\EderG\Documents\RIA\v2_light\onboarding\onboarding-app"

echo === Git Status ===
git status --short

echo.
echo === Adding files ===
git add src/lib/db/schema/caseMessages.ts
git add src/lib/chat/baserow.ts
git add src/app/api/cases/stats/route.ts

echo.
echo === Committing ===
git commit -m "fix: Drizzle INSERT missing NOT NULL cols (created_on, updated_on, order) + stats dropdown" -m "caseMessages schema: added notNull to created_on/updated_on, changed order to numeric(40,20)." -m "createCaseMessageRow: set createdOn, updatedOn, order explicitly in Drizzle INSERT." -m "stats route: compute institutionBreakdown in Baserow fallback for SysAdmin dropdown." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

echo.
echo === Pushing ===
git push origin master

echo.
echo === Done ===
pause
