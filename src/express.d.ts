// src/types/express.d.ts
import * as express from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        email: string;
        expiresIn: number;
      };
    }
  }
}
