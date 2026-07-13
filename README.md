# Fantuz Media Server

Fantuz Media Server is a multi-application solution for searching a library of music tracks (mp3 or Flac) and play them back on a device of choice.

There are three separate applications:
* the server manages the files in the library and keeps a database full of metadata
* the fronted serves a nice responsive UI to any device in the local network to search for content and play it
* the player is optional (the frontend can play the tracks itself and cast them to an Airplay or Bluetooth receiver) and when installed on a machine, it can play the music from there.

A typical setup would be to have all applications running on a Raspberry Pi connected to an external DAC or an AVR receiver via HDMI. This way, you basically have a music streamer that you can control from a phone or a tablet.

> [!IMPORTANT]
> If you use the player, be aware that it requires additional software installed on your machine. Typically, it needs Media Player Daemon (mpd) running, but further customisations will be required on the Rasperry Pi to get it to work, depending on which OS you have chosen.
