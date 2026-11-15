const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".artifacts", "studio-workbench-browser");
fs.mkdirSync(output, { recursive: true });
const webpack = require("next/dist/compiled/webpack/webpack");
webpack.init();
const loader = path.join(output, "typescript-loader.cjs");
const navigation = path.join(output, "navigation.ts");
const entry = path.join(output, "fixture.tsx");
fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
fs.writeFileSync(navigation, 'export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>"/studio";export const useRouter=()=>({push(){},replace(){},prefetch(){}});');
fs.writeFileSync(entry, `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ApiContext} from '@/providers/app-context';
import {LocaleProvider} from '@/lib/i18n/locale-context';
import {ThemeProvider} from '@/components/theme-provider';
import {StudioWorkbench} from '@/features/runtime/studio-workbench';
const api={mode:'mock',async execute(){return []}};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')).render(<ThemeProvider><LocaleProvider><QueryClientProvider client={client}><ApiContext.Provider value={api}><StudioWorkbench/></ApiContext.Provider></QueryClientProvider></LocaleProvider></ThemeProvider>);
`);
async function main() {
  await new Promise((resolve,reject)=>webpack.webpack({
    mode:"development",entry,output:{path:output,filename:"fixture.js"},
    resolve:{extensions:[".tsx",".ts",".js"],alias:{"@":path.join(root,"src"),"next/navigation$":navigation},modules:[path.join(root,"node_modules")]},
    resolveLoader:{modules:[path.join(root,"node_modules")]},
    module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]},
    plugins:[new webpack.webpack.DefinePlugin({"process.env":JSON.stringify({NODE_ENV:"development"})})],
  },(error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  const css=await require("postcss")([require("@tailwindcss/postcss")()]).process(fs.readFileSync(path.join(root,"src/styles.css"),"utf8"),{from:path.join(root,"src/styles.css")});
  fs.writeFileSync(path.join(output,"fixture.css"),css.css);
  const server=http.createServer((request,response)=>{
    if(request.url==="/fixture.js"||request.url==="/fixture.css"){
      response.setHeader("Content-Type",request.url.endsWith(".js")?"text/javascript":"text/css");
      response.end(fs.readFileSync(path.join(output,request.url.slice(1))));
    }else{
      response.setHeader("Content-Type","text/html; charset=utf-8");
      response.end('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try{
    browser=await require("playwright").chromium.launch({headless:true,channel:"chrome"});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.addInitScript(()=>localStorage.setItem("mavis.appearance","dark"));
    const errors=[];page.on("pageerror",error=>{errors.push(error.message);console.error("Browser error",error.message)});
    await page.goto("http://127.0.0.1:"+server.address().port);
    await page.screenshot({path:path.join(output,"initial.png"),fullPage:true,animations:"disabled"});
    const telemetry=page.getByRole("button",{name:/Service Telemetry & Impact/});
    await telemetry.waitFor();
    const graph=page.locator('svg[data-studio-graph]').first();
    const node=graph.getByRole("button",{name:"order-service",exact:true});
    const anchor=()=>node.evaluate(element=>{
      const label=element.querySelector(":scope > rect");
      return {x:Number(label.getAttribute("x"))+Number(label.getAttribute("width"))/2,y:Number(label.getAttribute("y"))-10};
    });
    const world=(point,yaw)=>({x:(point.x-600)*Math.cos(yaw)+(point.y-325)/0.5*Math.sin(yaw),
      z:-(point.x-600)*Math.sin(yaw)+(point.y-325)/0.5*Math.cos(yaw)});
    const bounds=await node.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down({button:"left"});
    await page.mouse.move(bounds.x+bounds.width/2+40,bounds.y+bounds.height/2+15,{steps:5});
    await page.mouse.up({button:"left"});
    const initialWorld=world(await anchor(),0.78);
    const movedBounds=await node.boundingBox();
    await page.mouse.move(movedBounds.x+movedBounds.width/2,movedBounds.y+movedBounds.height/2);
    await page.mouse.down({button:"right"});
    await page.mouse.move(movedBounds.x+movedBounds.width/2+50,movedBounds.y+movedBounds.height/2,{steps:8});
    await page.mouse.up({button:"right"});
    const rotatedWorld=world(await anchor(),0.78-50*0.0085);
    assert.ok(Math.abs(initialWorld.x-rotatedWorld.x)<0.01,"Orbit must retain the dragged node's world X");
    assert.ok(Math.abs(initialWorld.z-rotatedWorld.z)<0.01,"Orbit must retain the dragged node's world Z");
    assert.equal(await graph.evaluate(element=>element.dispatchEvent(new MouseEvent("contextmenu",{button:2,bubbles:true,cancelable:true}))),false);
    const board=await graph.boundingBox();
    await page.mouse.move(board.x+20,board.y+20);
    await page.mouse.down({button:"right"});
    await page.mouse.move(board.x+40,board.y+20);
    await page.evaluate(()=>window.dispatchEvent(new Event("blur")));
    const afterBlur=await anchor();
    await page.mouse.move(board.x+100,board.y+30);
    assert.deepEqual(await anchor(),afterBlur,"Blur must end orbit even while the mouse button remains down");
    await page.mouse.up({button:"right"});
    await page.mouse.move(board.x+150,board.y+40);
    assert.deepEqual(await anchor(),afterBlur,"Released pointer must not keep rotating");
    await page.getByRole("button",{name:"Stats",exact:true}).click();
    await page.getByText("Server Cluster Overview (Admin POV)",{exact:true}).waitFor();
    assert.equal(await page.locator("main").isVisible(),false);
    assert.equal(await page.getByText("Per-Service / API Telemetry (6)",{exact:true}).count(),0);
    await page.screenshot({path:path.join(output,"stats.png"),fullPage:true,animations:"disabled"});
    await telemetry.click();
    await page.getByText("Per-Service / API Telemetry (6)",{exact:true}).waitFor();
    assert.equal(await page.locator("main").isVisible(),true);
    assert.equal(await page.getByText("Server Cluster Overview (Admin POV)",{exact:true}).count(),0);
    await page.screenshot({path:path.join(output,"telemetry.png"),fullPage:true,animations:"disabled"});
    assert.deepEqual(errors,[]);
    console.log("PASS Studio world-layout orbit, pointer cleanup, context-menu prevention and separate Stats panels");
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
