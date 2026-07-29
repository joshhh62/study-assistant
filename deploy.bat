@echo off
cd /d D:\flam-study-assistant
git add -A >> gitlog.txt 2>&1
git commit -m "Deploy backend to Vercel as a serverless function" >> gitlog.txt 2>&1
git push origin main >> gitlog.txt 2>&1
notepad gitlog.txt
