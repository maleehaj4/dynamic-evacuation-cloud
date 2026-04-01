from fastapi import FastAPI, Form
from fastapi.responses import PlainTextResponse
from twilio.twiml.messaging_response import MessagingResponse
import uvicorn

app = FastAPI()

ROUTES = {
  'MEHDIPATNAM': (
    'Route from MEHDIPATNAM:\n'
    '1. Head NORTH on Mehdipatnam Main Rd 400m\n'
    '2. LEFT at NMDC Cross Rd\n'
    '3. Continue 600m → GOLCONDA GROUNDS (3000 capacity)\n'
    'Emergency: 040-23320020'
  ),
  'SECUNDERABAD': (
    'Route from SECUNDERABAD:\n'
    '1. Head WEST on Sardar Patel Rd 800m\n'
    '2. RIGHT at Clock Tower junction\n'
    '3. Continue 200m → PARADE GROUNDS (10000 capacity)\n'
    'Emergency: 040-27852020'
  ),
  'HITECH': (
    'Route from HITECH CITY:\n'
    '1. Head SOUTH on Cyber Towers Rd 1.2km\n'
    '2. LEFT at Nanakramguda flyover\n'
    '3. Continue 500m → HICC GROUNDS (5000 capacity)\n'
    'Emergency: 040-23302020'
  ),
  'NAMPALLY': (
    'Route from NAMPALLY:\n'
    '1. Head NORTH on Nampally Stn Rd 300m\n'
    '2. RIGHT at Gandhi Bhavan signal\n'
    '3. Continue 400m → GANDHI HOSPITAL (800 capacity)\n'
    'Emergency: 040-24600020'
  ),
}

@app.post('/sms')
async def receive_sms(Body: str = Form(...), From: str = Form(default='')):
  area = Body.strip().upper().replace('EVACUATE', '').strip()
  resp = MessagingResponse()
  route_text = ROUTES.get(area)
  if route_text:
    resp.message('🚨 EVACUATION ROUTE:\n' + route_text)
  else:
    options = ', '.join(ROUTES.keys())
    resp.message(f'Send: EVACUATE [AREA]\nAvailable: {options}\nExample: EVACUATE MEHDIPATNAM')
  return PlainTextResponse(str(resp), media_type='application/xml')

if __name__ == '__main__':
  uvicorn.run(app, host='0.0.0.0', port=8000)