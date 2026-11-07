import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCommerce, CATALOG, MAX_SHOPS, canOpenCafe } from '../server/commerce-domain.mjs';
function withData(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'horizonte-commerce-test-'));
  try { return fn(path.join(dir,'state.json')); }
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
test('cafeteria fictícia é criada e guardada em arquivo fora da pasta do jogo',()=>{
  withData(file=>{
    const commerce=createCommerce({file});
    assert.equal(commerce.snapshot().wallet,180);
    const shop=commerce.createCafe({x:12,z:5,name:'Café do Vale'});
    assert.equal(shop.id,'cafe-1');
    assert.equal(commerce.list().length,1);
    assert.equal(commerce.inventory(shop.id).products.length,Object.keys(CATALOG).length);
    assert.equal(createCommerce({file}).get(shop.id).name,'Café do Vale');
  });
});
test('não permite spawn na água, sobre a praça, casas ou sobre outra cafeteria',()=>{
  withData(file=>{
    const commerce=createCommerce({file});
    assert.equal(canOpenCafe(30,-25),false);
    assert.equal(canOpenCafe(0,6),false);
    assert.equal(canOpenCafe(-14,15),false);
    const shop=commerce.createCafe({x:12,z:5});
    assert.throws(()=>commerce.createCafe({x:13,z:6}),/Local inadequado/);
    assert.throws(()=>commerce.createCafe({x:30,z:-25}),/Local inadequado/);
    assert.equal(commerce.list().length,1);
  });
});
test('venda desconta moedas virtuais e estoque atomicamente',()=>{
  withData(file=>{
    const commerce=createCommerce({file});
    const shop=commerce.createCafe({x:12,z:5});
    const first=commerce.order({shopId:shop.id,sku:'cafe',quantity:2});
    assert.equal(first.receipt.amount,16);
    assert.equal(first.wallet,164);
    assert.equal(first.stock,12);
    assert.equal(commerce.cash(shop.id).revenue,16);
    assert.equal(commerce.cash(shop.id).orders,1);
    assert.equal(createCommerce({file}).snapshot().wallet,164);
    assert.throws(()=>commerce.order({shopId:shop.id,sku:'cafe',quantity:100}),/Quantidade inválida/);
    assert.throws(()=>commerce.order({shopId:shop.id,sku:'suco',quantity:9}),/Estoque insuficiente/);
    assert.equal(commerce.cash(shop.id).orders,1);
  });
});
test('Nina pode ser primeira cliente e não consome a carteira do jogador',()=>{
  withData(file=>{
    const commerce=createCommerce({file});
    const shop=commerce.createCafe({x:12,z:5});
    const sale=commerce.order({shopId:shop.id,sku:'pao_queijo',quantity:1,customer:'nina'});
    assert.equal(sale.receipt.customer,'nina');
    assert.equal(sale.wallet,180);
    assert.equal(commerce.get(shop.id).stock.pao_queijo,11);
  });
});
test('reposição valida sku/quantidade e não envolve pagamento externo',()=>{
  withData(file=>{
    const commerce=createCommerce({file});
    const shop=commerce.createCafe({x:12,z:5});
    const result=commerce.restock({shopId:shop.id,sku:'pao_queijo',quantity:5});
    assert.equal(result.stock,17);
    assert.equal(result.simulated,true);
    assert.throws(()=>commerce.restock({shopId:shop.id,sku:'pao_queijo',quantity:300}),/Quantidade inválida/);
    assert.throws(()=>commerce.order({shopId:shop.id,sku:'invalido'}),/Produto inexistente/);
  });
});
test('limite de saldo impede compra e não causa venda parcial',()=>{
  withData(file=>{
    const commerce=createCommerce({file});
    const shop=commerce.createCafe({x:12,z:5});
    commerce.order({shopId:shop.id,sku:'suco',quantity:8});
    commerce.restock({shopId:shop.id,sku:'suco',quantity:10});
    commerce.order({shopId:shop.id,sku:'suco',quantity:10});
    assert.equal(commerce.snapshot().wallet,0);
    assert.throws(()=>commerce.order({shopId:shop.id,sku:'cafe',quantity:1}),/moedas virtuais suficientes/);
    assert.equal(commerce.get(shop.id).stock.cafe,14);
  });
});

test('localizador encontra posição livre para cafeteria perto do personagem',async()=>{
  const {findCafeSpot,canOpenCafe}=await import('../src/commerce-placement.js');
  const player={x:0,z:6};
  const spot=findCafeSpot(player,[{x:0,z:15,radius:2}]);
  assert.ok(spot);
  assert.ok(canOpenCafe(spot.x,spot.z));
  assert.ok(Math.hypot(spot.x,spot.z-15)>6);
});
test('não coloca nova loja no mesmo terreno de uma existente',async()=>{
  const {findCafeSpot,canOpenCafe}=await import('../src/commerce-placement.js');
  const occupied=[{id:'cafe-existente',x:9,z:12}];
  const spot=findCafeSpot({x:0,z:6},[{x:9,z:12,radius:3.7}],occupied);
  assert.ok(spot);
  assert.ok(canOpenCafe(spot.x,spot.z,occupied));
  assert.ok(Math.hypot(spot.x-9,spot.z-12)>=10);
});
