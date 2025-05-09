import * as ngrok from "@ngrok/ngrok";
import dotenv from "dotenv";

dotenv.config();

export default async function startNgrok() {
  if (process.env.NGROK_AUTH_TOKEN === undefined) {
    console.log("NGROK auth token not set");
    return "NGROK auth token not set";
  }
  const listner = await ngrok.forward({
    addr: 'localhost:3000',
    authtoken: process.env.NGROK_AUTH_TOKEN,
    domain: 'cheerful-fish-slowly.ngrok-free.app',
    proto: 'http'
  });
  console.log(listner.url())

  return listner;
}
