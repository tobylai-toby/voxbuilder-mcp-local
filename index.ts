#!/usr/bin/env node
import {
    McpServer,
    ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import writeVox from "vox-saver"
import * as fs from "node:fs"
import packageJSON from "./package.json" with { type: "json" };

// Create an MCP server
const server = new McpServer({
    name: "VoxBuilder",
    version: packageJSON.version,
});

interface Block {
    pos: { x: number; y: number; z: number };
    color?: { r: number; g: number; b: number; a: number };
}

class VoxModel {
    // pos2color: Record<string, { r: number; g: number; b: number; a: number }> ={};
    pos2color:Map<string, { r: number; g: number; b: number; a: number }> = new Map();
    setVoxels(blocks: Block[]) {
        blocks.forEach((block) => {
            let pos_str = `${block.pos.x},${block.pos.y},${block.pos.z}`;
            if (!block.color) {
                this.pos2color.delete(pos_str)
            } else{
                this.pos2color.set(pos_str,block.color)
            }
        });
    }
    getVoxels(): Block[] {
        return Array.from(this.pos2color.entries()).map(([pos_str, color]) => {
            const [x, y, z] = pos_str.split(",").map(Number);
            return { pos: { x, y, z }, color };
        });
    }
    genVox(){
        let size={x:-1,y:-1,z:-1};
        let rgba_values:{r:number,g:number,b:number,a:number}[]=[];
        let rgba_table:Map<string,number> = new Map();
        let xyzi_values:{x:number,y:number,z:number,i:number}[]=[];
        for (const [pos_str, color] of this.pos2color.entries()) {
            const [x, y, z] = pos_str.split(",").map(Number);
            if (x > size.x) size.x = x;
            if (y > size.y) size.y = y;
            if (z > size.z) size.z = z;
            let rgba_str=`${color.r},${color.g},${color.b},${color.a}`;
            if (!rgba_table.has(rgba_str)){
                rgba_table.set(rgba_str,rgba_values.length+1);
                rgba_values.push(color);
            }
            xyzi_values.push({x,y:z,z:y,i:rgba_table.get(rgba_str)!})
        }
        size.x++;size.y++;size.z++;
        while(rgba_values.length<256){
            rgba_values.push({r:255,g:255,b:255,a:255});
        }
        return {
            size,
            xyzi:{
                numVoxels:xyzi_values.length,
                values:xyzi_values
            },
            rgba:{
                values:rgba_values
            }
        }
    }
}

const models: Record<string,VoxModel> = {}

// create model project
server.tool("create","create a .vox model project",{
    name: z.string().describe("the name of the model project,without extension")
},async({name}, extra)=>{
    models[name]=new VoxModel();
    return { content: [{ type: "text", text: `Created project: ${name}` }] };
});

server.tool("setVoxels","set voxel blocks to a model project by pos and rgba color",{
    name: z.string().describe("the name of the model project,without extension (should be created first)"),
    voxels: z.array(z.object({
        pos:z.object({
            x:z.number(),
            y:z.number(),
            z:z.number()
        }).describe("the position of the voxel block, must be beyond 0 and should be integer"),
        color:z.object({
            r:z.number(),
            g:z.number(),
            b:z.number(),
            a:z.number()
        }).optional().describe("the color of the voxel block, set to null to remove the voxel block")
    })).describe("the voxel blocks to set")
},async({name,voxels}, extra)=>{
    models[name].setVoxels(voxels);
    return { content: [{ type: "text", text: `Set voxels to project: ${name}` }] };
});

server.tool("getVoxels","get voxel blocks from a model project, use this to know what you have done",{
    name: z.string().describe("the name of the model project,without extension (should be created first)")
},async({name}, extra)=>{
    return { content: [{ type: "text", text: JSON.stringify(models[name].getVoxels()) }] };
});

server.tool("exportVox","export a .vox model project to a local file path",{
    name: z.string().describe("the name of the model project,without extension (should be created first)"),
    path: z.string().describe("the local path to export the model project to (file fullpath & full name)")
},async({name,path}, extra)=>{
    const vox_data=models[name].genVox();
    fs.writeFileSync(path,Buffer.from(writeVox(vox_data as any)));
    return { content: [{ type: "text", text: `Exported project: ${name} to ${path}` }] };
})

const transport = new StdioServerTransport();
(async () => await server.connect(transport))();