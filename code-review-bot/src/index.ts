import { run } from "probot";
import {bot} from "./bot.js"
import * as pino from 'pino'

run(bot, {
  log: pino.pino()
});

