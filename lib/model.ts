export function newId():string { if(typeof crypto.randomUUID === "function")return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
import { Schema } from "prosemirror-model";
export const schema = new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"inline*",toDOM:()=>["p",0],parseDOM:[{tag:"p"}]},heading:{group:"block",content:"inline*",attrs:{level:{default:2}},toDOM:()=>["h2",0],parseDOM:[{tag:"h2"}]},scene_break:{group:"block",toDOM:()=>["hr"],parseDOM:[{tag:"hr"}]},text:{group:"inline"}},marks:{strong:{toDOM:()=>["strong",0],parseDOM:[{tag:"strong"},{tag:"b"}]},em:{toDOM:()=>["em",0],parseDOM:[{tag:"em"},{tag:"i"}]}}});
export type Chapter={id:string;title:string;content:Record<string,unknown>};
export type Book={id:string;schemaVersion:1;revision:number;title:string;author:string;updatedAt:string;chapters:Chapter[]};
export function blankChapter(title="Untitled chapter"):Chapter{return {id:newId(),title,content:{type:"doc",content:[{type:"paragraph"}]}}}
export function createBook(title:string,author:string):Book{return {id:newId(),schemaVersion:1,revision:0,title,author,updatedAt:new Date().toISOString(),chapters:[blankChapter("Chapter One")]}}
export function validateBook(value:unknown):Book{
 if(!value||typeof value!=="object")throw Error("Invalid project.");
 const b=value as Book;
 if(b.schemaVersion!==1||typeof b.id!=="string"||typeof b.title!=="string"||typeof b.author!=="string"||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.updatedAt!=="string"||!Array.isArray(b.chapters)||!b.chapters.length||b.chapters.length>10000)throw Error("Unsupported or damaged project.");
 const ids=new Set<string>();
 for(const c of b.chapters){if(!c||typeof c.id!=="string"||ids.has(c.id)||typeof c.title!=="string")throw Error("Invalid chapter structure.");ids.add(c.id);schema.nodeFromJSON(c.content).check()}
 return b;
}
