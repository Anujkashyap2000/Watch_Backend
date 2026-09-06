import { Router } from "express";
import { loginUser, logoutUser, registerUser, refreshAcessToken,  getCurrentUser,  } from "../controllers/user.controller.js";
import {upload} from '../middlewares/multer.middleware.js'
import {verifyJWT} from '../middlewares/auth.middleware.js'

const router = Router()

router.route('/register').post( registerUser)
router.route('/login').post(loginUser)
router.route('/logout').post(logoutUser)
router.route("/current-user").get(verifyJWT,getCurrentUser)

export default router