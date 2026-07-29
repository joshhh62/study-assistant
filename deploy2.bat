@echo off
cd /d D:\flam-study-assistant
git add -A >> gitlog3.txt 2>&1
git commit -m "Update README deployment section for live Vercel URLs" >> gitlog3.txt 2>&1
git push origin main >> gitlog3.txt 2>&1
notepad gitlog3.txt
