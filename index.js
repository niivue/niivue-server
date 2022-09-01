const express = require("express");
const ws = require("ws");
const queryString = require("query-string");
const { v4: uuidv4 } = require("uuid");
const MESSAGE = Object.freeze({
  UPDATE: "update",
  CREATE: "create",
  JOIN: "join",
  ADD_VOLUME_URL: "add volume url",
  REMOVE_VOLUME_URL: "remove volume media",
  ADD_MESH_URL: "add mesh url",
  REMOVE_MESH_URL: "remove mesh media",
  SET_4D_VOL_INDEX: "set 4d vol index",
  UPDATE_IMAGE_OPTIONS: "update image options",
  UPDATE_CROSSHAIR_POS: "update crosshair pos",
  CROSSHAIR_POS_UPDATED: "crosshair pos updated",
  USER_JOINED: "user joined",
  UPDATE_SCENE_STATE: "update scene state",
  UPDATE_USER_STATE: "update user state",
  USER_STATE_UPDATED: "user state updated",
  SCENE_STATE_UPDATED: "scene state updated",
  ACK: "ack",
  SESSION_CREATED: "session created",
  SESSION_JOINED: "session joined",
});

let sessionOwnersMap = new Map();
let sessionMap = new Map();
let userMap = new Map();
let connectionUserMap = new Map();
const app = express();
const wsServer = new ws.Server({ noServer: true });
const connections = [];

function sendOtherClientsMessage(sender, msg) {
  let others = connections.filter((c) => c != sender);
  sendClientsMessage(others, msg);
}

function sendClientsMessage(clientConnections, msg) {
  for (const connection of clientConnections) {
    connection.send(JSON.stringify(msg));
  }
}

/**
 * Get a random color to assign user
 * @returns {number[]} RGB color
 */
function getRandomColor() {
  let color;
  switch (Array.from(userMap.values()).length) {
    case 0:
      color = [1, 0, 0];
    case 1:
      color = [0, 1, 0];
      break;
    case 2:
      color = [0, 0, 1];
      break;
    default:
      color = [Math.random(), Math.random(), Math.random()];
  }

  return [...color, 1];
}

function assignUser(parsedMessage) {
  let displayName;
  let id = uuidv4();
  if (parsedMessage.displayName) {
    displayName = parsedMessage.displayName;
  } else {
    displayName = `user-${id}`;
  }
  let userKey = uuidv4();
  let color = parsedMessage.color ? parsedMessage.color : getRandomColor();
  let crosshairPos = [0.5, 0.5, 0.5];
  userMap.set(userKey, { id, displayName, color, crosshairPos });
  return userKey;
}

function getSessionUrl(connectionRequest, session) {
  let host = "";
  let protocol = "ws://";
  for (let i = 0; i < connectionRequest.rawHeaders.length; i++) {
    if (connectionRequest.rawHeaders[i] === "Host") {
      host = connectionRequest.rawHeaders[i + 1];
    } else if (connectionRequest.rawHeaders[i] === "Host") {
    }
  }
  let sessionUrl = new URL(protocol + host);
  sessionUrl.pathname = "websockets";
  sessionUrl.search = "session=" + session;
  return sessionUrl.href;
}

wsServer.on("connection", (websocketConnection, connectionRequest) => {
  const [_path, params] = connectionRequest?.url?.split("?");
  const connectionParams = queryString.parse(params);
  const session = connectionParams["session"];
  // console.log('new connection on session ' + session);
  if (connections.findIndex((w) => w === websocketConnection) === -1) {
    connections.push(websocketConnection);
    console.log("added connection");
    console.log(connections.length + " connections");
  }

  let scene = null;
  if (session) {
    if (sessionMap.has(session)) {
      scene = sessionMap.get(session);
    }
  }

  websocketConnection.on("message", (message) => {
    const parsedMessage = JSON.parse(message);
    let res = {
      message: "OK",
      op: MESSAGE.ACK,
    };

    switch (parsedMessage.op) {
      case MESSAGE.CREATE:
        res.op = MESSAGE.SESSION_CREATED;
        // check if we already have the session
        if (sessionMap.has(session)) {
          res.op = MESSAGE.SESSION_JOINED;
          res.message = "session already exists";
          res.isError = true;          
          res["isController"] = parsedMessage.key === scene.key;          
          res["url"] = getSessionUrl(connectionRequest, session);
          res["userList"] = Array.from(userMap.values());
          let userKey = assignUser(parsedMessage);
          res["userKey"] = userKey;
          let user = userMap.get(userKey);
          res["userId"] = user.id;
          res["userName"] = user.displayName;

          // add user as controller
          if(res["isController"]) {
            sessionOwnersMap.get(session).push(user.id);
          }

          sendOtherClientsMessage(websocketConnection, {
            op: MESSAGE.USER_JOINED,
            user: userMap.get(res["userKey"]),
          });
        } else {
          scene = {
            elevation: 0,
            azimuth: 0,
            zoom: 1.0,
            cliplane: [0, 0, 0, 0],
            key: parsedMessage.key ? parsedMessage.key : uuidv4(),
          };
          sessionMap.set(session, scene);
          console.log("scene created for " + session);
          let userKey = assignUser(parsedMessage);
          let user = userMap.get(userKey);
          res["url"] = getSessionUrl(connectionRequest, session);
          res["key"] = scene.key;
          res["userId"] = user.id;
          res["userKey"] = userKey;
          res["userName"] = user.displayName;
          res["isController"] = true;
          // add this as a session owner
          sessionOwnersMap.set(session, [user.id]);

          if (!connectionUserMap.has(websocketConnection)) {
            connectionUserMap.set(websocketConnection, user.name);
          } else {
            console.log(
              "connection already associatged with " +
                connectionUserMap.get(websocketConnection)
            );
          }
          console.log('created session ' + session);
          // console.log('url: ' + res['url']);
        }
        break;
      case MESSAGE.UPDATE_SCENE_STATE:
        // console.log('update message called');
        // only allow requests with session key to update
        if (scene.key === parsedMessage.key) {
          scene.azimuth = parsedMessage.azimuth;
          scene.elevation = parsedMessage.elevation;
          scene.zoom = parsedMessage.zoom;
          scene.clipPlane = parsedMessage.clipPlane;
          // console.log('with correct key');
          sendOtherClientsMessage(websocketConnection, {
            op: MESSAGE.SCENE_STATE_UPDATED,
            message: "OK",
            azimuth: scene.azimuth,
            elevation: scene.elevation,
            zoom: scene.zoom,
            clipPlane: scene.clipPlane,
          });
        }
        break;
      case MESSAGE.JOIN:
        if (scene) {
          res.op = SESSION_JOINED;
          res["isController"] = parsedMessage.key === scene.key;          
          res["url"] = getSessionUrl(connectionRequest, session);
          res["userList"] = Array.from(userMap.values());
          let userKey = assignUser(parsedMessage);
          res["userKey"] = userKey;
          let user = userMap.get(userKey);
          res["userId"] = user.id;
          res["userName"] = user.displayName;

          // add user as controller
          if(res["isController"]) {
            sessionOwnersMap.get(session).push(user.id);
          }

          if (!connectionUserMap.has(websocketConnection)) {
            connectionUserMap.set(websocketConnection, user.id);
          } else {
            console.log(
              "connection already associated with " +
                connectionUserMap.get(websocketConnection)
            );
          }
          sendOtherClientsMessage(websocketConnection, {
            op: MESSAGE.USER_JOINED,
            user: userMap.get(res["userKey"]),
          });
        } else {
          console.log("scene for " + session + " not found");
        }
        break;
      case MESSAGE.UPDATE_IMAGE_OPTIONS:
      case MESSAGE.ADD_VOLUME_URL:
        if (scene.key === parsedMessage.key) {
          let msg = {
            op: parsedMessage.op,
            urlImageOptions: parsedMessage.urlImageOptions,
          };
          sendOtherClientsMessage(websocketConnection, msg);
        }
        break;
      case MESSAGE.REMOVE_VOLUME_URL:
        if (scene.key === parsedMessage.key) {
          sendOtherClientsMessage(websocketConnection, {
            op: REMOVE_VOLUME_URL,
            url: parsedMessage.url,
          });
        }
        break;
      case MESSAGE.SET_4D_VOL_INDEX:
        if (scene.key === parsedMessage.key) {
          sendOtherClientsMessage(websocketConnection, {
            op: SET_4D_VOL_INDEX,
            url: parsedMessage.url,
            index: parsedMessage.index,
          });
        }
        break;
      case MESSAGE.ADD_MESH_URL:
        if (scene.key === parsedMessage.key) {
          let msg = {
            op: parsedMessage.op,
            urlMeshOptions: parsedMessage.urlMeshOptions,
          };
          sendOtherClientsMessage(websocketConnection, msg);
        }
        break;
      case MESSAGE.REMOVE_MESH_URL:
        if (scene.key === parsedMessage.key) {
          sendOtherClientsMessage(websocketConnection, {
            op: MESSAGE.REMOVE_MESH_URL,
            url: parsedMessage.url,
          });
        }
        break;
      case MESSAGE.UPDATE_USER_STATE:
        if (userMap.has(parsedMessage.userKey)) {
          let user = userMap.get(parsedMessage.userKey);
          if (parsedMessage.id == user.id) {
            user.color = parsedMessage.color;
            user.displayName = parsedMessage.displayName;

            userMap.set(parsedMessage.userKey, user);
          }
        }
        break;

      case MESSAGE.UPDATE_CROSSHAIR_POS:
        if (userMap.has(parsedMessage.userKey)) {
          let user = userMap.get(parsedMessage.userKey);
          if (parsedMessage.id == user.id) {
            // console.log("updating crosshairs for " + user.displayName);
            // console.log(parsedMessage.crosshairPos);

            user.crosshairPos = parsedMessage.crosshairPos;
            userMap.set(parsedMessage.userKey, user);
            let msg = {
              op: CMESSAGE.ROSSHAIR_POS_UPDATED,
              id: user.id,
              isController: sessionOwnersMap.get(session).includes(user.id),
              crosshairPos: parsedMessage.crosshairPos,
            };

            sendOtherClientsMessage(websocketConnection, msg);
          }
        }
        break;

      default:
        res["op"] = MESSAGE.SCENE_STATE_UPDATED;
        res["azimuth"] = scene.azimuth;
        res["elevation"] = scene.elevation;
        res["zoom"] = scene.zoom;
        res["clipPlane"] = scene.clipPlane;

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
server.on("upgrade", (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (socket) => {
    wsServer.emit("connection", socket, request);
  });
});
