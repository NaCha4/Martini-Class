// Public static pages do not initialize authentication or load the Firebase SDK.
export async function api(...args){
 const client=await import('./firebase.js');
 return client.api(...args);
}
