import express from 'express';
import bodyParser from 'body-parser';
import OpenAI from 'openai';
import chrisSamples from './samples/chris-samples.json';
import mattSamples from './samples/matt-samples.json';
import luisSamples from './samples/luis-samples.json';
import godseySamples from './samples/godsey-samples.json';

var cors = require('cors');

const app = express();
const assistantId = 'asst_MSBA0kNARSTuPPe9vZ3kXBTA';

type KeystrokeEvent = {
    eventType: 'keydown' | 'keyup';
    key: string;
    timeStamp: number;
};

type TimingSequence = KeystrokeEvent[];

type SubjectData = {
    subject: string;
    inputSeries: TimingSequence[];
};

type Keypress = {
    key: string;
    downTime: number;
    upTime: number;
}

type Keystroke = {
    key: string;
    nextKey: string | null;
    hTime: number; // Hold time: duration between keydown and keyup for the same key
    ddTime: number | null; // Down-Down time: duration between this keydown and the next keydown
    udTime: number | null; // Up-Down time: duration between this keyup and the next keydown
};

type ProcessedData = {
    subject: string;
    keystrokes: Keystroke[][];
};

const validSamples = {
    'luis.martinez01@sinch.com': luisSamples,
    'chris.haynes@sinch.com': chrisSamples,
    'matt.prestlien@sinch.com': mattSamples,
    'john.godsey@sinch.com': godseySamples
};

const recordedSamples = {}; // This will store new recorded samples

const openai = new OpenAI({
    apiKey: '' // Add your OpenAI API key here
});

const jsonParser = bodyParser.json();

function captureKeystrokes(series: TimingSequence): Keypress[] {
    const eventList: Keypress[] = [];

    let shiftActive = false;

    series.forEach(event => {
        const {key, timeStamp, eventType} = event;

        // Handle Shift key combination
        if (key === 'Shift') {
            shiftActive = eventType === 'keydown';
            return; // Skip adding Shift key directly to eventList
        }

        const adjustedKey = shiftActive ? `Shift-${key.toLowerCase()}` : key;

        if (eventType === 'keydown') {
            eventList.push({key: adjustedKey, downTime: timeStamp, upTime: null});
        } else if (eventType === 'keyup') {
            // Find the corresponding keydown event to pair the upTime
            const keydownEvent = eventList.find(e => e.key === adjustedKey && e.upTime === null);
            if (keydownEvent) {
                keydownEvent.upTime = timeStamp;
            }
        }
    });

    return eventList;
}

function processKeystrokeData(rawData: SubjectData[]): ProcessedData[] {
    const processedData: ProcessedData[] = [];

    rawData.forEach(subjectData => {
        const {subject, inputSeries} = subjectData;
        const keystrokes: Keystroke[][] = [];

        inputSeries.forEach(timingSequence => {
            const orderedEvents: Keypress[] = captureKeystrokes(timingSequence);

            const keystrokeSequence: Keystroke[] = [];

            for (let i = 0; i < orderedEvents.length; i++) {
                const currentEvent = orderedEvents[i];
                const nextEvent = orderedEvents[i + 1];

                const holdTime = (currentEvent.upTime - currentEvent.downTime) / 1000;
                const ddTime = nextEvent ? (nextEvent.downTime - currentEvent.downTime) / 1000 : null;
                const udTime = nextEvent ? (nextEvent.downTime - currentEvent.upTime) / 1000 : null;

                keystrokeSequence.push({
                    key: currentEvent.key,
                    nextKey: nextEvent ? nextEvent.key : null,
                    hTime: parseFloat(holdTime.toFixed(4)),
                    ddTime: ddTime !== null ? parseFloat(ddTime.toFixed(4)) : null,
                    udTime: udTime !== null ? parseFloat(udTime.toFixed(4)) : null,
                });
            }

            keystrokes.push(keystrokeSequence);
        });

        processedData.push({subject, keystrokes});
    });

    return processedData;
}

function getSubjectSamples(subject: string): Keystroke[][][] {
    const combinedSamples: Keystroke[][][] = [];
    if (validSamples[subject]) {
        const processedData = processKeystrokeData(validSamples[subject]);
        combinedSamples.push(processedData.map(data => data.keystrokes).flat(1));
    }
    if (recordedSamples[subject]) {
        combinedSamples.push(...recordedSamples[subject]);
    }
    return combinedSamples
}

app.use(cors());
app.get('/', (req, res) => res.send('Let\'s hack away.'));

app.post('/samples', jsonParser, function (req, res) {
    if (req.body.length) {
        const data: ProcessedData[] = processKeystrokeData(req.body);
        data.forEach(subjectData => {
            if (!recordedSamples[subjectData.subject]) {
                recordedSamples[subjectData.subject] = [];
            }

            recordedSamples[subjectData.subject].push(subjectData.keystrokes);
        });

        res.send(`Processed and stored ${req.body.length} inputs for ${data[0].subject}.`);
    } else {
        res.status(500).send('Cannot process request without valid input data');
    }
});

app.get('/samples', (req, res) => {
    const subject = req.query.subject;
    if (!subject) {
        res.status(400).send('Cannot process request without subject');
        return;
    }

    res.send(getSubjectSamples(subject) || []);
});

app.post('/challenges', jsonParser, async function (req, res) {
    if (req.body.input) {
        let subject = 'dummy@noemail.com';
        let combinedSamples: Keystroke[][][] = [];

        if (req.body.subject) {
            subject = req.body.subject;
            combinedSamples = getSubjectSamples(subject);
        }

        console.log('Combined samples:', combinedSamples);

        const processedData = processKeystrokeData([{subject: req.body.subject, inputSeries: [req.body.input]}]);
        const preppedData = processedData.map(data => data.keystrokes);

        console.log('Prepped data:', preppedData);
        console.log('Combined data:', combinedSamples)

        const assistantThread = await openai.beta.threads.create();
        const data = {
            input: preppedData,
            samples: combinedSamples
        };

        const threadMessages = await openai.beta.threads.messages.create(
            assistantThread.id,
            {role: 'user', content: JSON.stringify(data)},
        );

        const run = await openai.beta.threads.runs.create(
            assistantThread.id,
            {assistant_id: assistantId}
        );

        console.log(run);
        res.send(run);
    } else {
        res.status(500).send('Cannot process request without input data in payload body');
    }
});

app.get('/challenges', jsonParser, async function (req, res) {
    if (req.query.threadId && req.query.runId) {
        const thread = await openai.beta.threads.retrieve(req.query.threadId);
        const messages = await openai.beta.threads.messages.list(req.query.threadId);

        const run = await openai.beta.threads.runs.retrieve(
            req.query.threadId,
            req.query.runId
        );

        console.log(run);
        res.send({originalThread: thread, originalMessages: messages, runStatus: run});

    } else {
        res.status(500).send('Cannot process request without threadId and runId');
    }
});

app.listen(3001, () => console.log('Server ready on port 3001.'));

module.exports = app;