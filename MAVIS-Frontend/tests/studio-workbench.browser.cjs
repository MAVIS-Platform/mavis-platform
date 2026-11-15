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
    await page.addInitScript(()=>{
      window.studioAudioNotes=0;
      window.lastStudioAudioNote=0;
      const createGain=AudioContext.prototype.createGain;
      AudioContext.prototype.createGain=function(){
        const gain=createGain.call(this);
        window.studioAudioMaster ??= gain;
        return gain;
      };
      const create=AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator=function(){
        window.studioAudioNotes++;
        window.lastStudioAudioNote=performance.now();
        return create.call(this);
      };
    });
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
    const arrows=await graph.locator("[data-studio-wire-arrow]").evaluateAll(elements=>elements.map(arrow=>{
      const edge=arrow.closest("[data-studio-edge-to]");
      const graph=arrow.ownerSVGElement;
      const label=[...graph.querySelectorAll("[data-studio-node]")].find(node=>
        node.getAttribute("data-studio-node")===edge.getAttribute("data-studio-edge-to")
      ).querySelector("[data-studio-node-label]").getBoundingClientRect();
      const tip=new DOMPoint().matrixTransform(arrow.getScreenCTM());
      return tip.x<label.left || tip.x>label.right || tip.y<label.top || tip.y>label.bottom;
    }));
    assert.ok(arrows.length>0 && arrows.every(Boolean),"Wire arrowheads must clear destination labels after orbit");
    assert.equal(await graph.evaluate(element=>element.dispatchEvent(new MouseEvent("contextmenu",{button:2,bubbles:true,cancelable:true}))),false);
    const board=await graph.boundingBox();
    const scene=graph.locator(":scope > g").first();
    const sceneBeforePan=await scene.getAttribute("transform");
    const nodeBeforePan=await anchor();
    const screenBeforePan=await node.boundingBox();
    await page.mouse.move(board.x+30,board.y+32);
    await page.mouse.down({button:"left"});
    await page.mouse.move(board.x+95,board.y+58,{steps:5});
    await page.mouse.up({button:"left"});
    assert.notEqual(await scene.getAttribute("transform"),sceneBeforePan,"Left drag must pan the canvas");
    assert.deepEqual(await anchor(),nodeBeforePan,"Panning must not change the camera angle or projected layout");
    const screenAfterPan=await node.boundingBox();
    assert.ok(Math.abs(screenAfterPan.x-screenBeforePan.x-65)<1 && Math.abs(screenAfterPan.y-screenBeforePan.y-26)<1,
      "Panning must follow the pointer in screen pixels");
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
    await page.evaluate(()=>{
      window.canvasMenus=[];
      window.addEventListener("contextmenu",event=>window.canvasMenus.push(event.defaultPrevented));
    });
    await page.mouse.move(board.x+30,board.y+30);
    await page.mouse.down({button:"right"});
    await page.mouse.move(board.x-10,board.y+50,{steps:4});
    await page.mouse.up({button:"right"});
    const afterOutsideRelease=await anchor();
    await page.mouse.move(board.x+100,board.y+100);
    assert.deepEqual(await anchor(),afterOutsideRelease,"Release outside canvas must end orbit");
    assert.ok(await page.evaluate(()=>window.canvasMenus.length>0&&window.canvasMenus.every(Boolean)),"Canvas-origin right gestures must suppress native context menus");
    const deck=graph.getByTestId("studio-deck");
    const originalDeck=await deck.getAttribute("points");
    const dragStart=await node.boundingBox();
    await page.mouse.move(dragStart.x+dragStart.width/2,dragStart.y+dragStart.height/2);
    await page.mouse.down({button:"left"});
    await page.mouse.move(board.x+board.width*0.94,board.y+board.height*0.86,{steps:10});
    await page.waitForFunction(previous=>document.querySelector('[data-testid="studio-deck"]').getAttribute("points")!==previous,originalDeck);
    const expandedDeck=await deck.getAttribute("points");
    const corners=expandedDeck.split(" ").map(point=>point.split(",").map(Number));
    const center=await anchor();
    // Node anchors project at height 0. The tabletop is 14 units lower.
    const tabletopY=center.y+14*0.866;
    assert.ok(corners.every(([x,y],index)=>{
      const [nextX,nextY]=corners[(index+1)%corners.length];
      return (nextX-x)*(tabletopY-y)-(nextY-y)*(center.x-x)>0;
    }),"Expanded tabletop must cover the dragged node before pointer release");
    await page.mouse.up({button:"left"});
    assert.equal(await deck.getAttribute("points"),expandedDeck,"Releasing the node must retain the expanded deck");
    const stats=page.getByRole("button",{name:"Stats",exact:true});
    assert.ok(await stats.evaluate(element=>element.parentElement.firstElementChild===element),"Stats must be the first dock tab");
    await stats.click();
    const overview=page.getByRole("heading",{name:"Cluster Overview"});
    const dock=page.getByTestId("studio-dock-content");
    await overview.waitFor();
    const overviewPanel=page.getByRole("region",{name:"Cluster Overview"});
    for(const metric of ["Incoming demand","Handled traffic","Dropped traffic","Estimated E2E p95","CPU allocation","RAM usage"]){
      assert.equal(await overviewPanel.getByText(metric,{exact:true}).count(),1);
    }
    assert.equal(await page.locator("main").isVisible(),true,"Stats must leave the topology visible");
    assert.equal(await page.getByText("Per-Service / API Telemetry (6)",{exact:true}).count(),0);
    await dock.hover();
    await page.mouse.wheel(0,180);
    await page.waitForFunction(()=>document.querySelector('[data-testid="studio-dock-content"]').scrollTop>0);
    await page.screenshot({path:path.join(output,"stats.png"),fullPage:true,animations:"disabled"});
    await stats.click();
    assert.equal(await overview.count(),0,"Clicking the active Stats tab must collapse the dock");
    await telemetry.click();
    await page.getByText("Per-Service / API Telemetry (6)",{exact:true}).waitFor();
    assert.equal(await overview.count(),0);
    const search=page.getByRole("textbox",{name:"Search services"});
    await search.fill("order-service");
    const table=page.getByRole("table");
    assert.equal(await table.locator("tbody tr").count(),1);
    const service=table.getByRole("button",{name:"order-service",exact:true});
    await service.click();
    assert.equal(await service.getAttribute("aria-pressed"),"true");
    await table.getByRole("button",{name:"Increase replicas for order-service"}).click();
    assert.ok(await table.getByText("2",{exact:true}).isVisible(),"Inline scaling must update the table");
    await search.clear();
    await page.screenshot({path:path.join(output,"telemetry.png"),fullPage:true,animations:"disabled"});
    const orderWire=graph.locator('[data-studio-edge-from="api-gateway"][data-studio-edge-to="order-service"]');
    const orderLatency=orderWire.locator("[data-studio-wire-metric]");
    const baselineLatency=Number((await orderLatency.textContent()).match(/\d+/)[0]);
    const latencyInput=page.getByRole("spinbutton",{name:"Custom injected network latency ms"});
    await latencyInput.fill("200");
    assert.equal(await orderLatency.textContent(),`≈ ${baselineLatency+200} ms`);
    await latencyInput.fill("0");
    const demand=page.getByRole("spinbutton",{name:"Custom incoming traffic req/s"});
    await demand.fill("1500");
    await graph.getByText("503 ✕",{exact:true}).waitFor();
    assert.equal(await orderWire.locator("[data-studio-wire-hint]").count(),0);
    assert.ok(await page.getByText("Demand exceeds capacity",{exact:true}).isVisible());
    const replicasBeforeHint=await page.getByRole("spinbutton",{name:"Custom pod replica count"}).inputValue();
    assert.equal(await page.getByRole("spinbutton",{name:"Custom pod replica count"}).inputValue(),replicasBeforeHint);
    assert.equal(await page.getByRole("button",{name:/^(Scale|Fix) ×/}).count(),0);
    await page.getByRole("button",{name:"Rate Limiter",exact:true}).click();
    await graph.getByText("429 ✕",{exact:true}).waitFor();
    await demand.fill("240");
    await page.getByRole("spinbutton",{name:"Custom injected network latency ms"}).fill("1500");
    await graph.getByText("CALL FAILED",{exact:true}).waitFor();
    assert.equal(await graph.getByText("503 ✕",{exact:true}).count(),0,"An upstream timeout has no HTTP response");
    await page.getByRole("spinbutton",{name:"Custom injected network latency ms"}).fill("0");
    await table.getByRole("button",{name:"Decrease replicas for orders-postgres"}).click();
    await stats.click();
    assert.equal(await page.getByRole("region",{name:"Services needing attention"}).count(),0);
    await telemetry.click();
    const databaseRow=table.getByRole("row").filter({hasText:"orders-postgres"});
    assert.ok(await databaseRow.getByRole("cell",{name:"Down",exact:true}).isVisible());
    const orderRow=table.getByRole("row").filter({hasText:"order-service"});
    assert.ok(await orderRow.getByRole("cell",{name:"Bottleneck",exact:true}).isVisible());
    assert.equal(await node.locator("[data-studio-node-label]").getAttribute("stroke"),"#fbbf24");
    await databaseRow.getByRole("button",{name:"orders-postgres",exact:true}).click();
    assert.ok(await page.getByRole("region",{name:"Load and capacity"}).getByText("Stopped",{exact:true}).isVisible());
    await graph.getByText("CALL FAILED",{exact:true}).waitFor();
    assert.equal(await graph.getByText("503 ✕",{exact:true}).count(),0,"An unavailable JDBC destination must not emit an HTTP status");
    await page.getByRole("button",{name:"2D",exact:true}).click();
    for(const label of ["CDN Edge","WAF","Load Balancer","Gateway","Service","Worker","Auth / SSO","Serverless","Postgres","Redis","MongoDB","S3 Store","Elastic","Kafka","RabbitMQ","OTel APM"]){
      await page.getByRole("button",{name:"+ "+label,exact:true}).click();
    }
    const symbols=graph.locator("[data-studio-symbol]");
    const silhouettes=await symbols.evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[
      node.getAttribute("data-studio-symbol"),node.querySelector("path").getAttribute("d")
    ])));
    assert.equal(Object.keys(silhouettes).length,19,"Catalog and business services must all have a recognizable symbol");
    assert.equal(new Set(Object.values(silhouettes)).size,19,"Function types must have distinct silhouettes");
    const sql=graph.getByRole("button",{name:"orders-postgres",exact:true});
    assert.equal(await sql.locator('[data-studio-symbol="sql"]').count(),1,"Storage role takes precedence over the business service name");
    await sql.focus();
    await page.keyboard.press("Enter");
    assert.equal(await sql.getAttribute("aria-pressed"),"true","2D symbols must preserve keyboard selection");
    await page.screenshot({path:path.join(output,"symbols-2d.png"),fullPage:true,animations:"disabled"});
    const edgeCount=graph.locator("[data-studio-edge-from]");
    const originalEdgeCount=await edgeCount.count();
    const transfer=await page.evaluateHandle(()=>{
      const value=new DataTransfer();
      value.setData("application/x-mavis-studio-spawn","s3-storage");
      return value;
    });
    const graphBounds=await graph.boundingBox();
    await graph.dispatchEvent("drop",{dataTransfer:transfer,clientX:graphBounds.x+85,clientY:graphBounds.y+graphBounds.height-65});
    const newNode=graph.getByRole("button",{name:"s3-storage-2",exact:true});
    await newNode.waitFor();
    assert.equal(await edgeCount.count(),originalEdgeCount,"Dropping a new block must leave it disconnected");
    const originalNodeTransform=await newNode.locator(":scope > g[transform]").getAttribute("transform");
    const wire=graph.locator('[data-studio-edge-from="s3-storage-2"][data-studio-edge-to="order-service"]');
    const port=graph.locator('[data-studio-connect-port="s3-storage-2"]');
    const orderNode=graph.getByRole("button",{name:"order-service",exact:true});
    async function dragWireTo(x,y){
      const box=await port.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down({button:"left"});
      await page.mouse.move(x,y,{steps:8});
      await graph.locator("[data-studio-link-preview]").waitFor();
      await page.mouse.up({button:"left"});
      assert.equal(await graph.locator("[data-studio-link-preview]").count(),0);
    }
    await dragWireTo(graphBounds.x+20,graphBounds.y+graphBounds.height-15);
    assert.equal(await edgeCount.count(),originalEdgeCount,"Releasing over blank canvas must cancel the connection");
    const target=await orderNode.boundingBox();
    await dragWireTo(target.x+target.width/2,target.y+target.height/2);
    assert.equal(await wire.count(),1,"Dragging a port onto a node must add a directed wire");
    await dragWireTo(target.x+target.width/2,target.y+target.height/2);
    assert.equal(await wire.count(),1,"Repeating a connection must not remove it or add a duplicate");
    assert.equal(await newNode.locator(":scope > g[transform]").getAttribute("transform"),originalNodeTransform,"Wiring must not move the source node");
    await page.getByRole("button",{name:"3D",exact:true}).click();
    assert.equal(await wire.count(),1,"Switching views must retain manually drawn wires");
    const inventoryLabel=graph.getByRole("button",{name:"inventory-service",exact:true}).locator(":scope > rect").first();
    const inventory=await inventoryLabel.boundingBox();
    await dragWireTo(inventory.x+inventory.width/2,inventory.y+inventory.height/2);
    assert.equal(await graph.locator('[data-studio-edge-from="s3-storage-2"][data-studio-edge-to="inventory-service"]').count(),1);
    const nameInput=page.getByRole("textbox",{name:"Node name"});
    const nodeHeading=page.getByRole("heading",{name:"s3-storage-2",exact:true}).getByRole("button");
    assert.equal(await nameInput.count(),0,"The Inspector should not show a separate rename field");
    await nodeHeading.dblclick();
    await nameInput.fill("Cancelled name");
    await nameInput.press("Escape");
    assert.equal(await nameInput.count(),0);
    await nodeHeading.dblclick();
    await nameInput.fill("orders-postgres");
    await nameInput.press("Enter");
    await page.getByText("A node already uses this name.",{exact:true}).waitFor();
    const storageName="Kho hóa đơn";
    await nameInput.fill(storageName);
    await nameInput.press("Enter");
    await graph.getByRole("button",{name:storageName,exact:true}).waitFor();
    assert.equal(await wire.count(),1,"Renaming must keep the existing wire");
    await page.getByRole("button",{name:"2D",exact:true}).click();
    assert.equal(await graph.getByRole("button",{name:storageName,exact:true}).locator('[data-studio-symbol="object"]').count(),1);
    await page.getByRole("button",{name:/^Snapshots/}).click();
    await page.getByRole("textbox",{name:"Snapshot note"}).fill("Grading evidence");
    await page.getByRole("button",{name:"Record replay",exact:true}).click();
    await demand.fill("450");
    await page.getByText("Recording · 2 steps",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Stop & save replay"}).click();
    const replayDiagram=page.getByRole("img",{name:"Replay diagram"});
    await replayDiagram.waitFor();
    const exportedSvg=decodeURIComponent((await replayDiagram.getAttribute("src")).split(",").slice(1).join(","));
    assert.match(exportedSvg,/data-studio-node="s3-storage-2"/);
    assert.doesNotMatch(exportedSvg,/data-studio-scene="" transform=/);
    assert.match(await page.getByRole("link",{name:"Download PNG"}).getAttribute("href"),/^data:image\/png;base64,/);
    const [report]=await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button",{name:"Download evidence",exact:true}).click(),
    ]);
    assert.match(report.suggestedFilename(),/^mavis-evidence-.*\.html$/);
    const reportText=fs.readFileSync(await report.path(),"utf8");
    assert.match(reportText,/Grading evidence/);
    assert.match(reportText,/Configuration or topology changed/);
    await page.getByRole("button",{name:"Play replay",exact:true}).click();
    await page.getByText(/Step 2\/3/).waitFor();
    await page.getByText("Snapshot nodes",{exact:true}).click();
    await page.getByText(storageName+" → order-service · HTTP",{exact:true}).waitFor();
    await page.getByRole("heading",{name:storageName,exact:true}).getByRole("button").dblclick();
    await nameInput.fill("Kho mới");
    await nameInput.press("Enter");
    await graph.getByRole("button",{name:"Kho mới",exact:true}).waitFor();
    assert.ok(await page.getByText(storageName+" → order-service · HTTP",{exact:true}).isVisible(),"Captured names must remain unchanged");
    const wirePoint=await wire.locator("[data-studio-wire-hit]").evaluate(path=>{
      const point=path.getPointAtLength(path.getTotalLength()*0.48);
      const screen=point.matrixTransform(path.getScreenCTM());
      return {x:screen.x,y:screen.y};
    });
    await page.mouse.click(wirePoint.x,wirePoint.y);
    assert.equal(await wire.getAttribute("aria-pressed"),"true","Clicking the wire must select it");
    await graph.getByRole("button",{name:"Disconnect selected wire"}).click();
    assert.equal(await wire.count(),0,"The selected wire must be removable from the canvas");
    assert.equal(await graph.locator('[data-studio-edge-from="s3-storage-2"][data-studio-edge-to="inventory-service"]').count(),1);
    assert.ok(await page.getByText(storageName+" → order-service · HTTP",{exact:true}).isVisible());
    await page.getByRole("button",{name:"3D",exact:true}).click();
    const database=graph.getByRole("button",{name:"orders-postgres",exact:true});
    await database.focus();
    await page.keyboard.press("Enter");
    const replicaInput=page.getByRole("spinbutton",{name:"Custom pod replica count"});
    const capacity=page.getByRole("region",{name:"Load and capacity"})
      .getByText("Max capacity",{exact:true}).locator("..").locator("strong");
    const sculpture=database.locator("[data-studio-sculpture]");
    const databaseWire=graph.locator('[data-studio-edge-from="order-service"][data-studio-edge-to="orders-postgres"]');
    await replicaInput.fill("32");
    const width32=(await sculpture.boundingBox()).width;
    const latency32=Number((await databaseWire.locator("[data-studio-wire-metric]").textContent()).match(/\d+/)[0]);
    const capacity32=Number((await capacity.textContent()).replace(/\D/g,""));
    for(const count of [54,256]){
      await replicaInput.fill(String(count));
      assert.equal(await replicaInput.inputValue(),String(count));
      assert.ok((await sculpture.boundingBox()).width>width32,"3D sculpture must continue growing above 32 pods");
      assert.ok(Number((await databaseWire.locator("[data-studio-wire-metric]").textContent()).match(/\d+/)[0])<latency32);
      assert.equal(Number((await capacity.textContent()).replace(/\D/g,"")),capacity32*count/32);
    }
    const scenarios=page.getByRole("region",{name:"Cluster Scenarios"});
    await scenarios.getByRole("button",{name:"Reset Cluster",exact:true}).click();
    const scenario=scenarios.getByRole("combobox",{name:"Cluster scenario"});
    const applyScenario=scenarios.getByRole("button",{name:"Apply scenario",exact:true});
    await applyScenario.click();
    assert.equal(await demand.inputValue(),"960","Flash sale should quadruple the gateway demand");
    await scenario.selectOption("SLOW_DB");
    await applyScenario.click();
    assert.equal(await latencyInput.inputValue(),"350");
    assert.match(await scenarios.getByRole("status").textContent(),/orders-postgres/);
    await replicaInput.fill("4");
    await scenario.selectOption("POD_FAILURE");
    await applyScenario.click();
    assert.equal(await replicaInput.inputValue(),"3","Losing one pod must leave the other replicas running");
    await scenario.selectOption("DB_OUTAGE");
    await applyScenario.click();
    assert.equal(await replicaInput.inputValue(),"0");
    await node.focus();
    await page.keyboard.press("Enter");
    for(const policy of ["Circuit Breaker","Auto-Scale HPA","L1 Read Cache","Rate Limiter"]){
      assert.equal(await page.getByRole("button",{name:policy,exact:true}).getAttribute("aria-pressed"),"false");
    }
    await databaseWire.getByText("CALL FAILED",{exact:true}).waitFor();
    const breaker=page.getByRole("button",{name:"Circuit Breaker",exact:true});
    await breaker.click();
    await databaseWire.getByText("CIRCUIT OPEN",{exact:true}).waitFor();
    assert.match(await databaseWire.locator(":scope > title").textContent(),/1 ms/);
    await breaker.click();
    await databaseWire.getByText("CALL FAILED",{exact:true}).waitFor();
    const capacityWithoutCache=Number(await capacity.textContent());
    await page.getByRole("button",{name:"L1 Read Cache",exact:true}).click();
    assert.ok(Number(await capacity.textContent())>capacityWithoutCache);
    await demand.fill("1300");
    assert.equal(await replicaInput.inputValue(),"1");
    await page.getByRole("button",{name:"Auto-Scale HPA",exact:true}).click();
    assert.equal(await replicaInput.inputValue(),"2");
    const sound=page.getByRole("button",{name:"Studio sound effects",exact:true});
    assert.equal(await sound.getAttribute("aria-pressed"),"false");
    assert.equal(await page.evaluate(()=>window.studioAudioNotes),0);
    await sound.click();
    await page.waitForFunction(()=>window.studioAudioNotes===1 && performance.now()-window.lastStudioAudioNote>65);
    await page.getByRole("button",{name:"+ Worker",exact:true}).click();
    await page.waitForFunction(()=>window.studioAudioNotes>=3);
    await sound.click();
    assert.equal(await sound.getAttribute("aria-pressed"),"false");
    await page.getByRole("button",{name:"+ Worker",exact:true}).click();
    assert.equal(await page.evaluate(()=>window.studioAudioNotes),3);
    const volumeSettings=page.getByRole("button",{name:"Studio volume settings",exact:true});
    await volumeSettings.click();
    const volume=page.getByRole("slider",{name:"Effects volume"});
    assert.equal(await volume.inputValue(),"40");
    await volume.press("End");
    for(let i=0;i<6;i++) await volume.press("ArrowLeft");
    assert.equal(await volume.inputValue(),"70");
    assert.equal(await page.evaluate(()=>window.studioAudioMaster.gain.value),0);
    await volume.press("Escape");
    await sound.click();
    await page.waitForFunction(()=>Math.abs(window.studioAudioMaster.gain.value-.56)<.001 &&
      window.studioAudioNotes===4 && performance.now()-window.lastStudioAudioNote>65);
    await stats.click();
    await page.waitForFunction(()=>window.studioAudioNotes===5);
    await demand.fill("4000");
    await page.waitForFunction(()=>window.studioAudioNotes===7);
    await demand.fill("4200");
    assert.equal(await page.evaluate(()=>window.studioAudioNotes),7,"An ongoing fault must not replay the crash sound");
    await sound.click();
    await page.reload();
    assert.equal(await sound.getAttribute("aria-pressed"),"false");
    await volumeSettings.click();
    assert.equal(await volume.inputValue(),"70");
    await volume.press("Escape");
    await page.getByRole("button",{name:"Snapshots (1)",exact:true}).click();
    await page.getByText("Grading evidence",{exact:true}).waitFor();
    const library=page.getByRole("region",{name:"Block library"});
    assert.equal(await library.getByRole("textbox",{name:"Custom block name"}).count(),0);
    const blockSearch=library.getByRole("searchbox",{name:"Search blocks"});
    await blockSearch.fill("redis");
    assert.equal(await library.getByRole("button",{name:"+ Postgres",exact:true}).count(),0);
    assert.equal(await library.getByRole("button",{name:"+ Redis",exact:true}).count(),1);
    await blockSearch.clear();
    await library.getByRole("button",{name:"Custom block",exact:true}).click();
    await library.getByRole("textbox",{name:"Custom block name"}).fill("Kho bài tập");
    await library.getByRole("combobox",{name:"Custom block type"}).selectOption("postgres-db");
    await library.getByRole("button",{name:"Add block",exact:true}).click();
    await graph.getByRole("button",{name:"Kho bài tập",exact:true}).waitFor();
    assert.equal(await library.getByRole("textbox",{name:"Custom block name"}).count(),0);
    assert.deepEqual(errors,[]);
    console.log("PASS Studio world-layout orbit, pointer cleanup, context-menu prevention and separate Stats panels");
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
