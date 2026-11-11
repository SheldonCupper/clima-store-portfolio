import { test, after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { reviewInput } from './productReviews'
const server=app.listen(0,'127.0.0.1'),restorers:(()=>void)[]=[]
function stub(target:object,key:PropertyKey,fn:unknown){const original=Reflect.get(target,key);Reflect.set(target,key,fn);restorers.push(()=>Reflect.set(target,key,original))}
beforeEach(()=>{process.env.JWT_SECRET='segredo-ficticio-avaliacoes';for(const model of [prisma.productReview,prisma.product,prisma.order,prisma.customerAccount])for(const method of ['findFirst','findMany','findUnique','aggregate','upsert','updateMany'])stub(model,method,async()=>{throw Error('Banco não simulado')})})
afterEach(()=>{for(const restore of restorers.reverse())restore();restorers.length=0})
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect()})
async function call(path:string,method='GET',body?:unknown,role=''){if(!server.listening)await new Promise<void>(r=>server.once('listening',r));const token=role?jwt.sign({role,...(role==='CUSTOMER'?{version:0}:{})},process.env.JWT_SECRET!,role==='CUSTOMER'?{subject:'42',audience:'customer-account',issuer:'ecommerce-api'}:{}):'';return fetch(`http://127.0.0.1:${(server.address()as{port:number}).port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Cookie:`${role==='CUSTOMER'?'customer_session':'admin_token'}=${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})}
const account=()=>stub(prisma.customerAccount,'findUnique',async()=>({id:42,name:'Cliente fictício',email:'teste@example.com',cpf:'',phone:'',sessionVersion:0,verificationRequired:false}))
test('avaliação valida nota inteira e comentário sem conteúdo de controle',()=>{assert.equal(reviewInput({rating:5,comment:' Produto muito bom. '}).comment,'Produto muito bom.');for(const data of [{rating:6,comment:'Produto bom.'},{rating:2.5,comment:'Produto bom.'},{rating:5,comment:'curto'},{rating:5,comment:'a'.repeat(2001)}])assert.throws(()=>reviewInput(data))})
test('avaliações: visitantes e clientes sem compra real não publicam, admin é obrigatório para moderar',async()=>{
 assert.equal((await call('/products/1/reviews','POST',{rating:5,comment:'Muito bom mesmo.'})).status,401)
 for(const [path,method,body]of [['/admin/products/1/reviews','GET',undefined],['/admin/product-reviews/id','PATCH',{status:'APPROVED'}]]as const)assert.equal((await call(path,method,body)).status,401)
 account();stub(prisma.product,'findFirst',async()=>({id:1}));stub(prisma.order,'findFirst',async(args:unknown)=>{const text=JSON.stringify(args);assert.match(text,/production/);assert.match(text,/APPROVED/);assert.match(text,/42/);assert.match(text,/refundedAmount/);return null})
 assert.equal((await call('/products/1/reviews','POST',{rating:5,comment:'Muito bom mesmo.'},'CUSTOMER')).status,403)
})
test('avaliação: identidade vem da sessão e nova edição volta para análise',async()=>{
 account();stub(prisma.product,'findFirst',async()=>({id:1}));stub(prisma.order,'findFirst',async()=>({id:9}));let saved=false
 stub(prisma.productReview,'upsert',async(args:{where:unknown;create:{accountId:number};update:{status:string}})=>{assert.deepEqual(args.where,{productId_accountId:{productId:1,accountId:42}});assert.equal(args.create.accountId,42);assert.equal(args.update.status,'PENDING');saved=true;return {}})
 assert.equal((await call('/products/1/reviews','POST',{rating:5,comment:'Excelente produto.',accountId:999,status:'APPROVED'},'CUSTOMER')).status,200);assert.equal(saved,true)
})
test('avaliações públicas expõem somente primeiro nome e avaliações aprovadas',async()=>{
 stub(prisma.product,'findFirst',async()=>({id:1}));stub(prisma.productReview,'findMany',async(args:{where:unknown})=>{assert.deepEqual(args.where,{productId:1,status:'APPROVED'});return[{id:'r',rating:5,comment:'Ótimo produto.',createdAt:new Date(),account:{name:'Maria Nome Privado',email:'privado@example.com'}}]});stub(prisma.productReview,'aggregate',async()=>({_count:{_all:1},_avg:{rating:5}}))
 const response=await call('/products/1/reviews');const data=await response.json();assert.equal(data.reviews[0].author,'Maria');assert.equal(data.reviews[0].account,undefined);assert.equal(data.reviews[0].email,undefined);assert.equal(data.eligible,false)
})
test('moderação não permite alterar texto, nota ou identidade do comprador',async()=>{
 assert.equal((await call('/admin/product-reviews/id','PATCH',{status:'APPROVED',comment:'Alterado'},'ADMIN')).status,400)
 stub(prisma.productReview,'updateMany',async(args:{data:unknown})=>{assert.deepEqual(args.data,{status:'APPROVED'});return{count:1}})
 assert.equal((await call('/admin/product-reviews/id','PATCH',{status:'APPROVED',updatedAt:new Date().toISOString()},'ADMIN')).status,200)
})
test('moderação recusa publicação se o comprador alterou o comentário após a leitura',async()=>{
 stub(prisma.productReview,'updateMany',async(args:{where:{updatedAt:Date}})=>{assert.ok(args.where.updatedAt instanceof Date);return{count:0}})
 assert.equal((await call('/admin/product-reviews/id','PATCH',{status:'APPROVED',updatedAt:new Date().toISOString()},'ADMIN')).status,409)
})
