import jwt, { JwtPayload } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import axios from "axios";

const validateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ message: "Unauthorized: Missing token" });
        return; // Ensure the function stops here
    }

    const token = authHeader.split(" ")[1];
    // console.log(`token:${token}`);
    const decoded = jwt.decode(token, { complete: true }) as { payload: JwtPayload };
    if (!decoded) {
        res.status(500).json({ message: "Failed to decode token" });
        return;
      }
    // console.log(`decoded token`, decoded);
    const issuer = decoded?.payload?.iss;

    // console.log(`issuer:`, issuer);
    if (!issuer) {
        res.status(500).json({ message: "Invalid token: Missing issuer" });
        return;
    }

    try {
        if (issuer.includes("oldcruxdb")) {
            try{
            const payload = jwt.verify(token, process.env.JWT_SECRET as string);
            // console.log(`db password token`,payload)
            next();
        } catch (error) {
            // console.log(error);
            if ((error as { name?: string })?.name === 'TokenExpiredError') {
                res.status(500).json({ message: "Token has expired" });
                return;
            } else if ((error as { name?: string })?.name === 'JsonWebTokenError') {
                res.status(500).json({ message: "Invalid token" });
                return;
            } else {
                res.status(500).json({ message: "Token verification failed" });
                return;
            }
          }
        }
        else if (issuer.includes("accounts.google.com")) {
            // Validate the access token with Google
            const response = await axios.get(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`);
            const tokenInfo = response.data;
        
            // Optional: Check audience (client ID)
            if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
                res.status(401).json({ message: "Unauthorized: Invalid client ID" });
                return; // Stop further execution
            }
            
            // Attach validated token info to the request
            // console.log(`token info ${tokenInfo}`, tokenInfo);
            // req.user = {
            //     email: tokenInfo.email,
            //     expiresIn: tokenInfo.expires_in,
            // };
            next(); // Proceed to the next middleware or route handler
        }
    } catch (error) {
        // console.error("Google token validation error:", error.message);
        // if (error.response && error.response.status === 400) {
          res.status(401).json({ message: "Unauthorized: Invalid token" });
        // } else {
        //   res.status(500).json({ message: "Internal server error" });
        // }
        return; // Stop execution after sending the response
    }
};

export default validateToken;
