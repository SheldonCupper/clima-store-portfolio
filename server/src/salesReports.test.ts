import { test, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { reportCsv, reportPeriod, salesDate, summarizeSales, type SalesRow } from './salesReports'
const period = reportPeriod({from:'2026-11-01',to:'2026-11-30',environment:'production'})
const row = (change: Partial<SalesRow> = {}): SalesRow => ({ id:1,createdAt:new Date('2026-10-31T12:00:00Z'),paymentApprovedAt:new Date('2026-11-02T12:00:00Z'),status:'CONFIRMED',paymentStatus:'APPROVED',paymentReviewRequired:false,subtotal:'100',discount:'10',shipping:'20',total:'110',paymentMethod:'PIX',customer:{name:'Cliente fictício'},items:[{productName:'Produto teste',isService:false,quantity:1,total:'60'},{productName:'Serviço teste',isService:true,quantity:1,total:'40'}],refundRequest:null,paymentCheckouts:[{environment:'production',payments:[]}],...change })
const server=app.listen(0,'127.0.0.1'),original=prisma.order.findMany
afterEach(()=>{prisma.order.findMany=original})
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect()})
test('relatório: datas válidas e limite de intervalo; meia-noite em São Paulo',()=>{
 assert.equal(period.start.toISOString(),'2026-11-01T03:00:00.000Z');assert.equal(period.end.toISOString(),'2026-12-01T03:00:00.000Z')
 assert.equal(salesDate(new Date('2026-11-02T02:59:59Z')),'2026-11-01')
 for(const change of [{from:'2026-02-30'},{to:'2026-10-31'},{to:'2028-01-01'},{environment:'todos'},{from:['2026-11-01']},{from:'2019-01-01'}])assert.throws(()=>reportPeriod({from:'2026-11-01',to:'2026-11-30',...change}))
})
test('relatório: recebimentos pela aprovação, sandbox isolado, descontos/frete e serviços separados',()=>{
 const report=summarizeSales([row(),row({id:2,paymentCheckouts:[{environment:'sandbox',payments:[]}]}),row({id:3,paymentReviewRequired:true}),row({id:4,paymentApprovedAt:null,paymentStatus:'PENDING',createdAt:new Date('2026-11-02T12:00:00Z')})],period)
 assert.equal(report.totals.received,11000);assert.equal(report.totals.discounts,1000);assert.equal(report.totals.shipping,2000);assert.equal(report.totals.products,6000);assert.equal(report.totals.services,4000);assert.equal(report.totals.pending,1);assert.equal(report.totals.review,1);assert.equal(report.totals.orders,1);assert.equal(report.days.find(d=>d.date==='2026-11-02')!.received,11000)
})
test('relatório: estorno posterior não reescreve a aprovação; saldo negativo quando compra é de outro mês',()=>{
 const order=row({paymentApprovedAt:new Date('2026-10-31T12:00:00Z'),status:'CANCELED',paymentStatus:'REFUNDED',refundRequest:{status:'CONFIRMED',amount:'110',confirmedAt:new Date('2026-11-03T12:00:00Z')},paymentCheckouts:[{environment:'production',payments:[{providerStatus:'refunded',providerUpdatedAt:new Date('2026-11-03T12:00:00Z'),refundedAmount:'110'}]}]})
 const report=summarizeSales([order],period);assert.equal(report.totals.received,0);assert.equal(report.totals.refunded,11000);assert.equal(report.totals.balance,-11000)
 const same=summarizeSales([row({...order,paymentApprovedAt:new Date('2026-11-02T12:00:00Z')})],period);assert.equal(same.totals.received,11000);assert.equal(same.totals.refunded,11000);assert.equal(same.totals.balance,0)
})
test('relatório: legado identificado, limites de dia e exportação UTF-8 protegem fórmulas e aspas',()=>{
 const report=summarizeSales([row({paymentApprovedAt:null,createdAt:new Date('2026-11-02T12:00:00Z'),customer:{name:'=HYPERLINK("teste")'}}),row({id:2,paymentApprovedAt:period.end}),row({id:3,paymentApprovedAt:new Date(+period.start-1)})],period)
 assert.equal(report.totals.received,11000);assert.equal(report.totals.legacyDates,1)
 const csv=reportCsv(report);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'="));assert.ok(csv.includes('""teste""'));assert.ok(csv.includes('110,00'))
 assert.equal(summarizeSales([],period).totals.balance,0)
})
test('relatório e CSV exigem admin, rejeitam intervalo inválido e filtram ambiente no banco',async()=>{
 if(!server.listening)await new Promise<void>(r=>server.once('listening',r));process.env.JWT_SECRET='segredo-ficticio-relatorio'
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/admin/sales-report`,query='?from=2026-11-01&to=2026-11-30'
 assert.equal((await fetch(base+query+'&format=csv')).status,401)
 const cookie='admin_token='+jwt.sign({role:'ADMIN'},process.env.JWT_SECRET)
 assert.equal((await fetch(base+'?from=errado&to=2026-11-30',{headers:{Cookie:cookie}})).status,400)
 Reflect.set(prisma.order, 'findMany', async (args:unknown)=>{assert.ok(JSON.stringify(args).includes('production'));return [row()]})
 const response=await fetch(base+query,{headers:{Cookie:cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).totals.received,11000)
 const csv=await fetch(base+query+'&format=csv',{headers:{Cookie:cookie}});assert.match(csv.headers.get('content-type')!,/text\/csv/);assert.match(csv.headers.get('content-disposition')!,/attachment/)
})
