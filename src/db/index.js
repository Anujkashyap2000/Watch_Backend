import mongoose from "mongoose";
import dns from "node:dns";
const dBname="WatchDB"
// Force Node to use Google Public DNS to bypass local SRV lookup blocks
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB=async ()=>{
    try{
        const connectionInstance=await mongoose.connect(`${process.env.MONGO_URI}/${dBname}`)
        console.log(`\n MongoDB connected !! DBHost: ${connectionInstance.connection.host}`);
    }catch(err){
        console.log("MongoDb Connection Failed",err);
        process.exit(1)
    }
    
}

export default connectDB;

