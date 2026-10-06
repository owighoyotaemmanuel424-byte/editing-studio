"use client";
import {ConvexProvider,ConvexReactClient} from "convex/react";
import Editor from "./editor";
export default function Home(){const url=process.env.NEXT_PUBLIC_CONVEX_URL;if(!url)return <Editor/>;return <ConvexProvider client={new ConvexReactClient(url)}><Editor/></ConvexProvider>}