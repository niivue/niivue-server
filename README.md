# niivue-server
A basic express web socket server.

Run the following in the root of the project to start the server
```console
niivue@niivue:~/niivue-server$ node index.js
```
In the niivue client set up a connection to the server.

Angular Example
```typescript
private serverConnection$?: WebSocketSubject<unknown>;
...
this.serverConnection$ = webSocket(`ws://localhost:3000/websockets?session=${this.id}`);
...
// respond to server messages
this.serverConnection$?.subscribe({
      next: msg => {    
        const message = msg as JSON;
        // console.log((msg as JSON));
        if(message['azimuth']) {
          // console.log('updating azimuth an elevation');
          this.niivue.scene.renderAzimuth = message['azimuth'];
          this.niivue.scene.renderElevation = message['elevation'];
          this.niivue.volScaleMultiplier = message['zoom'];
          this.niivue.scene.clipPlane = message['clipPlane'];
          this.niivue.drawScene();
        }
        
      }, // Called whenever there is a message from the server.
      error: err => console.log(err), // Called if at any point WebSocket API signals some kind of error.
      complete: () => console.log('complete') // Called when connection is closed (for whatever reason).
     });
...
// request updates from the server
this.serverConnection$?.next({
          "type": "get",          
        });  
...
// send updates to the server
this.serverConnection$?.next({
          "type": "put", 
          "azimuth": this.niivue.scene.renderAzimuth,
          "elevation": this.niivue.scene.renderElevation,
          "clipPlane": this.niivue.scene.clipPlane,
          "zoom": this.niivue.volScaleMultiplier
        });    

```

