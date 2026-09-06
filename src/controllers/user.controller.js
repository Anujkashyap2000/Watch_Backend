import {asyncHandler} from '../utils/asyncHandler.js'
import{ApiError} from '../utils/ApiError.js'
import {User} from '../models/user.model.js'
import {ApiResponse} from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from 'mongoose'

const generateAccessAndRefreshTokens = async (userId) =>
{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ValidateBeforeSave: false})

        return{accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500,"something went wrong while generating tokens")
    }
}

const registerUser = asyncHandler( async (req, res) => {

   
   
    const  {email, name, password, avatar} = req.body

   if (
    [name,email,password].some((field) => field?.trim() === "")
   ) {
     throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({email})

    if(existedUser){
        throw new ApiError(409, "User already Exist either with email ")
    }
    console.log(req.body);

    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    const totalUsers = await User.countDocuments();
    const userName=name+(totalUsers+1)
    
    

    const user = await User.create({
        fullName: name,
        avatar: avatar,
        email,
        password,
        userName : userName
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "something went wrong whilw registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Succesfully")
    )
})

const loginUser = asyncHandler(async(req,res)=>{
console.log(req.body);

    const {email,password} = req.body

    if(!email){
        throw new ApiError(400, "Username and Email is required")
    }

    const user = await User.findOne({email})

    if(!user){
        throw new ApiError(404, "User not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credintials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).
    select("-password -refreshToken")


    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken", refreshToken,options)
    .json(
        new ApiResponse(200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "user logged in succesfully"
        )
    )
})


const logoutUser = asyncHandler(async(req, res) =>{
    User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { 
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
     
    const options = {
        httpOnly: true,
        secure:true    
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,"User logged out succesfully"))
})


const refreshAcessToken = asyncHandler(async (req,res)=>{
   const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

   if(!incomingRefreshToken) throw new ApiError(401, "Unauthorize Request")

try {
       const decodedToken = jwt.verify(
        incomingRefreshToken, 
        process.env.REFRESH_TOKEN_SECRET
        )
    
       const user = await User.findById(decodedToken?._id)
    
       if(!user) throw new ApiError(401, "Invalid Refresh Token")
    
       if(incomingRefreshToken !== user?.refreshToken) throw new ApiError(401, "Refresh token is expired or used")
    
       const option = {
        httpOnly: true,
        secure: true
       }
    
       const {accessToken, newRefreshToken} = await generateAcessAndRefreshTokens(user._id)
    
       return res
       .status(200)
       .cookie("accessToken",accessToken,option)
       .cookie("refreshToken",newRefreshToken,option)
       .json(
        new ApiResponse(
            200,
            {accessToken,refreshToken:newRefreshToken},
            "AccessToken refreshed"
        )
       )
} catch (error) {
    throw new ApiError(500,error.message || "Invalid refresh token")
    
}
})

const getCurrentUser = asyncHandler(async(req,res) => {
    
    return res
    .status(200)
    .json(new ApiResponse(200,{user:req?.user},"Current user fetched succesfully"))

})

export{
    registerUser,
    loginUser,
    logoutUser,
    refreshAcessToken,
    getCurrentUser,
    
}