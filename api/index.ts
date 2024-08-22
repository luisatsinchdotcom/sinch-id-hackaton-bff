import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import genericSamples from "./samples/samples.json";
import chrisSamples from "./samples/chris-samples.json";
import mattSamples from "./samples/matt-samples.json";
import luisSamples from "./samples/luis-samples.json"
import godseySamples from "./samples/godsey-samples.json";
import kalebSamples from "./samples/kaleb-samples.json";
import eliasSamples from "./samples/elias-samples.json";
var cors = require('cors')

const app = express();
const assistantId = "asst_MSBA0kNARSTuPPe9vZ3kXBTA";
const validSamples = {
  "dummy@noemail.com": genericSamples,
  "luis.martinez01@sinch.com": luisSamples,
  "chris.haynes@sinch.com": chrisSamples,
  "matt.prestlien@sinch.com": mattSamples,
  "john.godsey@sinch.com": godseySamples,
  "kaleb.pomeroy@sinch.com": kalebSamples,
  "elias.moreira@sinch.com": eliasSamples
}

const openai = new OpenAI({
    // project: "sinch-id",
    apiKey: "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"
});

const jsonParser = bodyParser.json()

app.use(cors());
app.get("/", (req, res) => res.send("Let's hack away."));

app.post("/samples", jsonParser, function (req, res) {  
  if (req.body.userInput){
    res.send("Processing this amount of event inputs: " + req.body.userInput.length);

  } else{
    res.status(500);
    res.send('Cannot process request without userInput');
  } 
});

app.post("/challenges", jsonParser, async function (req, res) {  
  if (req.body.input){
    let subject = 'dummy@noemail.com';
    let sample: any;
    if (req.body.subject && validSamples[req.body.subject]){
      subject = req.body.subject;
      sample = validSamples[subject]
    }
    const assistantThread = await openai.beta.threads.create(); 
    const data = {
      input: req.body.input,
      samples: sample
    }
    
    const threadMessages = await openai.beta.threads.messages.create(
      assistantThread.id,
      { role: "user", content: JSON.stringify(data) }, 
    );

    const run = await openai.beta.threads.runs.create(
        assistantThread.id,
        { assistant_id: assistantId }
      );
      
      console.log(run);
      res.send(run);
  } else{
    res.status(500);
    res.send('Cannot process request without input data in payload body');
  } 
});

app.get("/challenges", jsonParser, async function (req, res) {  
  if (req.query.threadId && req.query.runId){
    const thread = await openai.beta.threads.retrieve(req.query.threadId);
    const messages = await openai.beta.threads.messages.list(req.query.threadId);

    const run = await openai.beta.threads.runs.retrieve(
      req.query.threadId,
      req.query.runId
    );

    console.log(run);
    res.send({originalThread: thread, originalMessages: messages, runStatus: run});

  } else{
    res.status(500);
    res.send('Cannot process request without threadId and runId');
  } 
});

app.listen(3001, () => console.log("Server ready on port 3000."));

module.exports = app;