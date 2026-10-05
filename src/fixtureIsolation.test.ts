import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
test('active entry point cannot import archived demos or historical fixtures',()=>{
 const visited=new Set<string>();
 function visit(file:string){
  if(visited.has(file))return;
  visited.add(file);
  assert.ok(!file.startsWith(path.join(root,'archive'))&&!file.startsWith(path.join(root,'tests')),`Runtime imports historical material: ${file}`);
  if(!/\.tsx?$/.test(file))return;
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function inspect(node:ts.Node){
   let specifier:ts.Expression|undefined;
   if(ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly)specifier=node.moduleSpecifier;
   if(ts.isExportDeclaration(node)&&!node.isTypeOnly)specifier=node.moduleSpecifier;
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)specifier=node.arguments[0];
   if(specifier&&ts.isStringLiteral(specifier)&&specifier.text.startsWith('.')){
    const base=path.resolve(path.dirname(file),specifier.text);
    const target=[base,base+'.ts',base+'.tsx'].find(existsSync);
    assert.ok(target,`Missing import: ${specifier.text} from ${file}`);
    visit(target);
   }
   ts.forEachChild(node,inspect);
  }
  inspect(source);
 }
 visit(path.join(root,'src/main.tsx'));
});
test('public assets contain no historical JSON snapshots',()=>{
 function check(directory:string){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
   const name=path.join(directory,entry.name);
   if(entry.isDirectory())check(name);
   else assert.ok(!name.endsWith('.json'),`JSON evidence must be an explicit import, not a shipped asset: ${name}`);
  }
 }
 check(path.join(root,'public'));
});
