###### .env file template

export NODE_ENV=development/production

export QUEST_DB_HOST=localhost:9000
export QUEST_DB_USER=admin
export QUEST_DB_PASSWORD=quest
export QUEST_DB_AUTO_FLUSH_ROWS=500
export QUEST_DB_AUTO_FLUSH_INTERVAL=1000

export API_KEY=AIzaSyC698qw4zG1Z3ZJuD5yRVQ7TFQjjI9SJxs
export AUTH_DOMAIN=fleetcontrol-15092024.firebaseapp.com
export PROJECT_ID=fleetcontrol-15092024
export STORAGE_BUCKET=fleetcontrol-15092024.appspot.com
export MESSAGEING_SENDER_ID=747763257230
export APP_ID=1:747763257230:web:5edbfbc3e5e1eff179dedf


export PG_HOST=localhost
export PG_PORT=5432
export PG_DATABASE=rparida
export PG_USER=rparida
export PG_PASSWORD=
export PG_DIALECT=postgres

export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export REDIS_CACHE_GLOBAL_TIMEOUT=3600     #1 hour

export SSE_DATA_PUSH_INTERVAL=10000   # 10 Secs
export POINT_WITHIN_RADIUS_ACCURACY_IN_METERS=30
export QUESTDB_GEOHASH_PRECISION=30
export GEOFENCE_SCHEDULE_ARRIVAL_WINDOW=30 # in minutes.  Because of the between operator in the query, this value will be sliced /2 while using.

###### .env file template


execute below command to continuously watch for changes while developing:

npx tsc --watch

run the application with 

npx ts-node src/app.ts

###### Docker Build and Push
npm run build
docker build --no-cache --platform linux/amd64 -t asia-south1-docker.pkg.dev/fleetcontrol-15092024/oldcruxrepo/nodeserver:latest .
docker push asia-south1-docker.pkg.dev/fleetcontrol-15092024/oldcruxrepo/nodeserver:latest

###### Docker Build and Push