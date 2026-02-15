cd ..
call .venv-vercel\Scripts\activate
cd nemonori
python -m uvicorn api.index:app --host 127.0.0.1 --port 8000