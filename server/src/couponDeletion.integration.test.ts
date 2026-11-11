import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { app } from './index'
import { claimCoupon, redeemCoupon } from './coupons'
const enabled=process.env.RUN_COUPON_DELETE_DB_TESTS==='true',options={skip:!enabled}
let server:ReturnType<typeof app.listen>,base:string,admin:Record<string,string>
before(async()=>{if(!enabled)return;assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/clima_payments_validation_/);process.env.JWT_SECRET='segredo-ficticio-exclusao';server=app.listen(0,'127.0.0.1');if(!server.listening)await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address()as{port:number}).port}/api`;admin={'Content-Type':'application/json',Cookie:'admin_token='+jwt.sign({role:'ADMIN'},process.env.JWT_SECRET)}})
after(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect()})
async function fixture(){const unique=randomUUID();const account=await prisma.customerAccount.create({data:{name:'Cliente fictício',email:unique+'@gmail.com',phone:'34999999999',cpf:unique,passwordHash:'hash-ficticio'}});const coupon=await prisma.coupon.create({data:{code:'T'+unique.replaceAll('-','').slice(0,20).toUpperCase(),kind:'FIXED',value:10,active:true,published:true}});return{account,coupon}}
async function remove(coupon:{id:string;code:string}){return fetch(base+'/admin/coupons/'+coupon.id,{method:'DELETE',headers:admin,body:JSON.stringify({confirmation:coupon.code})})}
test('Exclusão/SQL: preserva pedido e carteira, bloqueia resgate, prévia e novos usos; repetição é idempotente',options,async()=>{
 const{account,coupon}=await fixture();await redeemCoupon(coupon.id,account)
 const customer=await prisma.customer.create({data:{name:account.name,email:account.email,phone:account.phone,cpf:account.cpf}}),address=await prisma.address.create({data:{customerId:customer.id,cep:'38401721',street:'Teste',number:'1',district:'Teste',city:'Uberlândia',state:'MG'}})
 const order=await prisma.$transaction(async tx=>{await claimCoupon(tx,coupon.code,10000,account);return tx.order.create({data:{accountId:account.id,customerId:customer.id,addressId:address.id,couponId:coupon.id,couponCode:coupon.code,paymentMethod:'PIX',subtotal:100,discount:10,shipping:0,total:90}})})
 assert.equal((await remove(coupon)).status,200);assert.equal((await remove(coupon)).status,200)
 const closed=await prisma.coupon.findUniqueOrThrow({where:{id:coupon.id}});assert.ok(closed.deletedAt);assert.equal(closed.active,false);assert.equal(closed.published,false);assert.equal(closed.usedCount,1)
 const saved=await prisma.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(saved.couponCode,coupon.code);assert.equal(String(saved.discount),'10');assert.equal(String(saved.total),'90')
 assert.equal(await prisma.couponClaim.count({where:{couponId:coupon.id,accountId:account.id}}),1)
 await assert.rejects(redeemCoupon(coupon.id,account));await assert.rejects(prisma.$transaction(tx=>claimCoupon(tx,coupon.code,10000,account)))
 const list=await(await fetch(base+'/admin/coupons',{headers:admin})).json();assert.equal(list.some((c:{id:string})=>c.id===coupon.id),false)
 assert.equal((await fetch(base+'/admin/coupons/'+coupon.id,{method:'PATCH',headers:admin,body:JSON.stringify({active:true})})).status,404)
})
test('Exclusão/SQL: corrida com reserva permite apenas uma exclusão segura, sem romper histórico',options,async()=>{
 const{account,coupon}=await fixture()
 const results=await Promise.allSettled([prisma.$transaction(tx=>claimCoupon(tx,coupon.code,10000,account)),remove(coupon)])
 assert.equal(results[1].status,'fulfilled')
 const closed=await prisma.coupon.findUniqueOrThrow({where:{id:coupon.id}});assert.equal(closed.active,false);assert.ok(closed.deletedAt);assert.ok([0,1].includes(closed.usedCount))
 await assert.rejects(prisma.$transaction(tx=>claimCoupon(tx,coupon.code,10000,account)))
})
test('Exclusão/SQL: boas-vindas pode ser encerrado e configurado novamente sem reiniciar seu histórico de usos',options,async()=>{
 const body={kind:'PERCENT',value:10,minSubtotal:0,maxDiscount:null,active:true,published:true}
 const configure=()=>fetch(base+'/admin/coupons/welcome',{method:'PUT',headers:admin,body:JSON.stringify(body)})
 let response=await configure();assert.equal(response.status,200);const welcome=await response.json()
 assert.equal((await remove(welcome)).status,200)
 response=await configure();assert.equal(response.status,200);const restored=await response.json();assert.equal(restored.deletedAt,null);assert.equal(restored.id,welcome.id);assert.equal(restored.usedCount,welcome.usedCount)
})
