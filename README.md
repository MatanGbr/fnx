
### [matangbr/fnx](https://github.com/MatanGbr/fnx)
מערכת לניהול פניות
a project to...


**Monorepo Structure**
* `@fnx/app`

front-end React application
[fnx.matang.app](https://fnx.matang.app)


* `@fnx/api`<br/>
back-end Fastify API server 
**` curl api.fnx.matang.app`**


**External Services**
* MongoDB
NoSQL Database
**` mongosh \c`**
**` mongosh \c`**
**` mongosh \c`**



#### Run locally

`$ npm install` at the root

```
$ npm install
```

`$ npm run dev` to start on local server





#### Dependency




#### Deployment



```mermaid
  
flowchart

  

dns  --> cf

cf  --> gw  --> lambda  --> auth  --> api

cf  --> s3  --> app

lambda  --> role  --> db

  
  

dns["DNS  Resolution<br/> <span  style='font-size:smaller'>WAF  Protected<br/>Hosted  Zones </span>"]

cf["Cloudfront <br/> <span  style='font-size:smaller'> CDN  Distributions </span>"]

api["Fastify <br/> <span  style='font-size:smaller'> API  Server </span>"]

lambda["Lambda <br/> <span  style='font-size:smaller'> Serverless  Events"]

auth["JWT  Verification <br/> <span  style='font-size:smaller'> User  Authentication"]

gw["Gateway <br/> <span  style='font-size:smaller'> HTTP  Proxy </span>"]

db[("MongoDB/PG <br/> <span style='font-size:smaller'> NoSQL Database </span>")]

role["IAM  Role <br/> <span  style='font-size:smaller'> STS  Authentication </span>"]

s3["S3  Bucket<br/> <span  style='font-size:smaller'> Storage  Distribution </span>"]

app["React  App<br/> <span  style='font-size:smaller'> Web  Application </span>"]
```
