import {expect,it} from 'vitest'
import {buildDevelopmentFunctionalStudyCases} from '../../scripts/development-functional-study-cases.mjs'
import {developmentStudyResultFixture} from '../../scripts/test-fixtures/development-study-result-host.mjs'

it('preserves and copies host mappings for the already existing engineering supplier without changing saved task material',()=>{
 const f=developmentStudyResultFixture(),config=structuredClone(f.config)
 for(const entry of [...config.originals,config.adjacent,config.holdout])Object.assign(entry,{moduleAliases:{'@product/ref':'entry.mjs'}})
 const before=JSON.stringify(config),result=buildDevelopmentFunctionalStudyCases(config,f.material)
 expect(result).toBeDefined();expect(JSON.stringify(config)).toBe(before)
 for(const role of ['source1','source2','counterexample','adjacent','holdout'])expect(result![role].moduleAliases).toEqual({'@product/ref':'entry.mjs'})
 result!.source1.moduleAliases['@product/ref']='changed.mjs'
 expect(buildDevelopmentFunctionalStudyCases(config,f.material)!.source1.moduleAliases).toEqual({'@product/ref':'entry.mjs'})
})
