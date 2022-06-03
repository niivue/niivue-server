const express = require('express');
const ws = require('ws');
const queryString = require('query-string');

let sessionMap = new Map();

const app = express();
const wsServer = new ws.Server({ noServer: true });
wsServer.on('connection', (websocketConnection, connectionRequest) => {
  const [_path, params] = connectionRequest?.url?.split("?");
  const connectionParams = queryString.parse(params);
  const session = connectionParams['session'];
  let scene = null;
  console.log('session ' + session);
  if(session) {
    if(sessionMap.has(session)) {
      scene = sessionMap.get(session);
    }
    else {
      scene = {
        elevation: 0,
        azimuth: 0,
        zoom: 1.0,
        cliplane: [0, 0, 0, 0]
      }
      sessionMap.set(session, scene);
    }
  }

  websocketConnection.on('message', message => {
    const parsedMessage = JSON.parse(message);
    let res = {
      message: 'OK'
    }

    switch(parsedMessage.type) {
      case 'put':
        scene.azimuth = parsedMessage.azimuth;
        scene.elevation = parsedMessage.elevation;
        scene.zoom = parsedMessage.zoom;
        scene.clipPlane = parsedMessage.clipPlane;
        break;
      default:
        res['azimuth'] = scene.azimuth;
        res['elevation'] = scene.elevation;
        res['zoom'] = scene.zoom;
        res['clipPlane'] = scene.clipPlane;
        
      break;
    }
    // console.log(parsedMessage);
    // console.log(res);
    websocketConnection.send(JSON.stringify(res));
  });
});

// `server` is a vanilla Node.js HTTP server, so use
// the same ws upgrade process described here:
// https://www.npmjs.com/package/ws#multiple-servers-sharing-a-single-https-server
const server = app.listen(3000);
server.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, socket => {
    wsServer.emit('connection', socket, request);
  });
});