# midi-autorecorder
A very simple NodeJS web app used to automatically record midi input into midi files. Ideal for a small Raspberry Pi that always records.

App hooks onto single midi interface, and waits for first midi note to be played.
When first note is pressed, new recording is started automatically.
Recording ends automatically when there was no note played for 30 seconds.

# Requirements
- arecordmidi (apt-get install alsa-utils)
- NodeJS 20.x.x

# Usage
- Clone repo
- npm install
- npm start
- Navigate to http://127.0.0.1:8090/
