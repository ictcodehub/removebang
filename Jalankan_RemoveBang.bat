@echo off
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
start "" "http://localhost:5173/removebang/"
npm run dev
