import { init, i } from '@instantdb/core';

// ID for app: The Gatherer
const APP_ID = 'a214f864-d0d4-4aab-9db7-afe45854f13b';

const schema = i.schema({
  rooms: {
    main: {
      presence: i.entity({
        username: i.string(),
        x: i.number(),
        y: i.number()
      })
    }
  },
  entities: {
    maps: i.entity({
      resources: i.json()
    }),
    resources: i.entity({
      x: i.number(),
      y: i.number()
    })
  }
});

// Initialize the database
const db = init({ appId: APP_ID, schema });

// const room = db.joinRoom('main');

export default db;
