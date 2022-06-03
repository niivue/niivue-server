const express = require('express');
const ws = require('ws');
const queryString = require('query-string');
const { v4: uuidv4 } = require('uuid')

let sessionMap = new Map();

const app = express();
const wsServer = new ws.Server({ noServer: true });
const connections = [];

wsServer.on('connection', (websocketConnection, connectionRequest) => {
  const [_path, params] = connectionRequest?.url?.split("?");
  const connectionParams = queryString.parse(params);
  const session = connectionParams['session'];
  
  connections.push(websocketConnection);
  
  let scene = null;
  console.log('session ' + session);
  if(session) {
    if(sessionMap.has(session)) {
      scene = sessionMap.get(session);
    }
   
  }

  websocketConnection.on('message', message => {
    const parsedMessage = JSON.parse(message);
    let res = {
      message: 'OK'
    }

    switch(parsedMessage.type) {
      case 'create':
        // check if we already have the session
        if(sessionMap.has(session)) {
          res = {
            message: 'duplicate session'
          }
        }
        else {
          scene = {
            elevation: 0,
            azimuth: 0,
            zoom: 1.0,
            cliplane: [0, 0, 0, 0],
            key: uuidv4()
          }
          sessionMap.set(session, scene);
          let host = '';
          let protocol = 'ws://';
          for(let i = 0; i < connectionRequest.rawHeaders.length; i++ ) {
            if(connectionRequest.rawHeaders[i] === 'Host') {
              host = connectionRequest.rawHeaders[i + 1];
            } else if(connectionRequest.rawHeaders[i] === 'Host') {

            }
          }
          let sessionUrl = new URL(protocol+host);
          sessionUrl.pathname = 'websockets';
          sessionUrl.search = 'session=' + session;
          res['url'] = sessionUrl.href;
          res['key'] = scene.key;
        }
        break;
      case 'put':
        // only allow requests with session key to update
        if(scene.key === parsedMessage.key) {
          scene.azimuth = parsedMessage.azimuth;
          scene.elevation = parsedMessage.elevation;
          scene.zoom = parsedMessage.zoom;
          scene.clipPlane = parsedMessage.clipPlane;

          for(const connection of connections) {
            if(connection === websocketConnection)
              continue;
            update = {
              message: 'OK',
              azimuth: scene.azimuth,
              elevation: scene.elevation,
              zoom: scene.zoom,
              clipPlane: scene.clipPlane
            }
            connection.send(JSON.stringify(update));
            console.log('sent update');
          }
        }
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