import express, {urlencoded} from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app=express();

const allowedOrigins = [
    'http://localhost:5173',
  'https://localhost:5173',
  'https://watchplayer.vercel.app/'
    
]

app.use(cors({
    origin:function (origin, callback){
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            const msg = 'The CORS policy for this site does not allow access from the specified Origin';
            return callback(new Error(msg), false)

        }
        return callback(null, true);
    },
    credentials: true,
    methos:['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Authorisation']
}));

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))

app.use(express.static("public"))
app.use(cookieParser())

import userRouter from './routes/user.routes.js'
app.use("/api/v1/auth", userRouter)

export {app}