import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test, before, after } from 'node:test'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
const enabled=process.env.RUN_SALES_DB_TESTS==='true',options={skip:!enabled}
let server:ReturnType<typeof app.listen>,base:string,admin:Record<string,string>,customerHeaders:Record<string,string>,accountId:number,productId:number,orderId:number,checkoutId:string
before(async()=>{
 if(!enabled)return
 assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/clima_payments_validation_/)
 process.env.JWT_SECRET='segredo-ficticio-relatorios-sql'
 const id=randomUUID(),account=await prisma.customerAccount.create({data:{name:'Maria Nome Privado',email:id+'@gmail.com',phone:'34999999999',cpf:id,passwordHash:'hash-ficticio',verificationRequired:false}});accountId=account.id
 const category=await prisma.category.create({data:{name:'Categoria fictícia',slug:id}}),product=await prisma.product.create({data:{name:'Produto fictício',slug:id,sku:id,price:100,stock:10,categoryId:category.id}});productId=product.id
 const customer=await prisma.customer.create({data:{name:account.name,email:account.email,phone:account.phone,cpf:account.cpf}}),address=await prisma.address.create({data:{customerId:customer.id,cep:'38401721',street:'Teste',number:'1',district:'Teste',city:'Uberlândia',state:'MG'}})
 const order=await prisma.order.create({data:{accountId,customerId:customer.id,addressId:address.id,paymentMethod:'PIX',subtotal:100,discount:10,shipping:20,total:110,status:'CONFIRMED',paymentStatus:'APPROVED',createdAt:new Date('2041-10-30T12:00:00Z'),paymentApprovedAt:new Date('2041-11-02T03:00:00Z'),items:{create:{productId,productName:product.name,sku:id,unitPrice:100,quantity:1,total:100}}}});orderId=order.id
 const checkout=await prisma.paymentCheckout.create({data:{orderId,environment:'sandbox',sellerId:'123',amount:110,expiresAt:new Date('2041-12-01T12:00:00Z'),payments:{create:{environment:'sandbox',providerPaymentId:id,providerStatus:'approved',amount:110,paymentType:'bank_transfer',methodId:'pix',providerUpdatedAt:new Date('2041-11-02T03:00:00Z')}}}});checkoutId=checkout.id
 const secret=process.env.JWT_SECRET
 admin={'Content-Type':'application/json',Cookie:'admin_token='+jwt.sign({role:'ADMIN'},secret)}
 customerHeaders={'Content-Type':'application/json',Cookie:'customer_session='+jwt.sign({role:'CUSTOMER',version:0},secret,{subject:String(accountId),audience:'customer-account',issuer:'ecommerce-api'})}
 server=app.listen(0,'127.0.0.1');if(!server.listening)await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address()as{port:number}).port}/api`
})
after(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect()})
async function call(path:string,method='GET',body?:unknown,headers=admin){const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json()}}
test('Relatório/SQL: data de aprovação e ambiente filtrados na consulta real, sem chamadas financeiras',options,async()=>{
 const path='/admin/sales-report?from=2041-11-02&to=2041-11-02'
 const production=await call(path+'&environment=production');assert.equal(production.status,200);assert.equal(production.data.rows.some((row:{id:number})=>row.id===orderId),false)
 const sandbox=await call(path+'&environment=sandbox');assert.equal(sandbox.status,200);const sale=sandbox.data.rows.find((row:{id:number})=>row.id===orderId);assert.equal(sale.received,11000);assert.equal(sale.discount,1000);assert.equal(sale.shipping,2000);assert.ok(sandbox.data.totals.received>=11000)
})
test('Avaliações/SQL: sandbox recusado; compra real habilita análise; público e alteração de texto respeitam moderação',options,async()=>{
 const path=`/products/${productId}/reviews`,body={rating:5,comment:'Produto muito bom para o uso descrito.'}
 assert.equal((await call(path,'POST',body,customerHeaders)).status,403)
 await prisma.paymentCheckout.update({where:{id:checkoutId},data:{environment:'production'}})
 await prisma.providerPayment.updateMany({where:{checkoutId},data:{environment:'production'}})
 assert.equal((await call(path,'POST',body,customerHeaders)).status,200)
 const saved=await prisma.productReview.findUniqueOrThrow({where:{productId_accountId:{productId,accountId}}});assert.equal(saved.status,'PENDING')
 assert.equal((await call(path,'GET',undefined,{})).data.total,0)
 assert.equal((await call('/admin/product-reviews/'+saved.id,'PATCH',{status:'APPROVED',updatedAt:saved.updatedAt.toISOString()})).status,200)
 const visible=(await call(path,'GET',undefined,{})).data;assert.equal(visible.total,1);assert.equal(visible.reviews[0].author,'Maria');assert.equal(visible.reviews[0].accountId,undefined)
 assert.equal((await call(path,'POST',{rating:4,comment:'Atualizei minha opinião sobre o produto.'},customerHeaders)).status,200)
 assert.equal((await call(path,'GET',undefined,{})).data.total,0);assert.equal(await prisma.productReview.count({where:{productId,accountId}}),1)
 assert.equal((await call('/admin/product-reviews/'+saved.id,'PATCH',{status:'APPROVED',updatedAt:saved.updatedAt.toISOString()})).status,409)
 await prisma.order.update({where:{id:orderId},data:{paymentStatus:'REFUNDED',status:'CANCELED'}})
 assert.equal((await call(path,'POST',body,customerHeaders)).status,403)
})
