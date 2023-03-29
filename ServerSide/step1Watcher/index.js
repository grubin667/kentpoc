///////////////////////////////////
// step1Watcher
//

const path = require('path');
const Express = require('express');
const fs = require('fs');
const cors = require('cors');
const chokidar = require('chokidar');

const readyToProcess = false;

const initializeForProcessing = async (clientName) => {

  // Not sure yet how this is going to work eventually. For now, if clientName.length === 0,
  // we will work in /ServerSide/clients/noname. Otherwise, we will work in /ServerSide/clients/${clientName}.
  const watcher = chokidar.watch(`../clients/${clientName.length === 0 ? 'noname' : clientName}`, {
    interval: 2500,
    binaryInterval: 2000,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  })

  watcher.on('all', async (event, path) => {

    console.log(`${path} triggered ${event}`)
  })

  readyToProcess = true;
}

(async () => {

  try {

    const app = Express();
    app.use(cors());
    app.use(Express.json());

    app.post('/initialize', async (req, res) => {

      console.log(`Enter "/initialize" post route`);
      try {

        await initializeForProcessing(req.body.clientName || '');

        res.json({

          success: true,
          payload: {initialized: readyToProcess}
        })
      } catch (x) {

        console.log(`Error in "/initialize" post route: ${x.message}`);
        res.json({

          success: false,
          payload: x.message
        });
      } finally {

        console.log(`Exit "/initialize" post route`);
      }
    })
  } catch (x) {

    console.log(`Error in Watcher: ${x.message}`);
  }
})();
