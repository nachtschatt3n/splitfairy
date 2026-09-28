import {test,expect,type Page} from '@playwright/test';
import {ADMIN} from './env.js';
import {addFamily,addPerson,createTrip,mailsTo,openSection,planEvent,signInAsAdmin,switchTrip,unique} from './helpers.js';
const iso=(days:number)=>{const d=new Date(Date.now()+days*86400_000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const sheet=(page:Page)=>page.getByRole('dialog');
const closed=(page:Page)=>expect(page.getByRole('dialog')).toHaveCount(0);
async function toTripList(page:Page){const chip=page.getByRole('button',{name:/Switch trip/});if(await chip.isVisible())await chip.click();else await page.getByLabel('Current trip').selectOption({label:'All trips'});await expect(page.getByText('Every shared trip')).toBeVisible();}
test.describe.configure({mode:'serial'});

test('every entity can be created, changed and removed from the interface',async({page},testInfo)=>{
 test.setTimeout(150_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 const name=unique(testInfo,'Madeira');await createTrip(page,name,iso(0),iso(6));

 // Trip: rename and move the dates.
 await openSection(page,'People');
 await page.getByRole('button',{name:'Edit trip'}).click();
 const renamed=`${name} & Azores`;
 await sheet(page).getByLabel('Trip name').fill(renamed);await sheet(page).getByLabel('Last day').fill(iso(8));
 await sheet(page).getByRole('button',{name:'Save trip'}).click();await closed(page);
 await expect(page.locator('.settings-block',{hasText:'Trip settings'})).toContainText(renamed);

 // Families and people.
 await addFamily(page,'Costa');await addFamily(page,'Weber');await addFamily(page,'Temporary');
 await page.getByRole('button',{name:'Edit Temporary'}).click();await sheet(page).getByLabel('Family name').fill('Tmp family');await sheet(page).getByRole('button',{name:'Save'}).click();await closed(page);
 await expect(page.locator('.family-title',{hasText:'Tmp family'})).toBeVisible();
 await page.getByRole('button',{name:'Edit Tmp family'}).click();await sheet(page).getByRole('button',{name:'Delete family'}).click();await closed(page);
 await expect(page.locator('.family-title',{hasText:'Tmp family'})).toHaveCount(0);
 await addPerson(page,'Rui','Costa');await addPerson(page,'Kid','Costa',{share:'Child · 0.5'});await addPerson(page,'Jonas','Weber');
 await page.getByRole('button',{name:'Edit Costa'}).click();await expect(sheet(page)).toContainText('move or remove its people first');await sheet(page).getByRole('button',{name:'Close'}).click();
 // Rename, change share, then move someone on their own and back into a family.
 await page.getByRole('button',{name:'Edit Kid'}).click();
 await sheet(page).getByLabel('Name').fill('Maria');await sheet(page).getByLabel('Share of costs').selectOption({label:'Teen · 0.75'});
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(page.getByRole('button',{name:'Edit Maria'})).toContainText('Teen');
 await page.getByRole('button',{name:'Edit Jonas'}).click();await sheet(page).getByLabel('Belongs to').selectOption({label:'On their own'});await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(page.locator('.family-block',{hasText:'On their own'})).toContainText('Jonas');
 await expect(page.locator('.family-block',{hasText:'Weber'})).toContainText('0 people');
 await page.getByRole('button',{name:'Edit Jonas'}).click();await sheet(page).getByLabel('Belongs to').selectOption({label:'Weber'});await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(page.locator('.family-block',{hasText:'On their own'})).toHaveCount(0);
 await expect(page.locator('.family-block',{hasText:'Weber'})).toContainText('Jonas');

 // Plans: create, edit, and a person removed from the trip also leaves the plan.
 await openSection(page,'Plan');
 await planEvent(page,'Levada walk','activity');
 await page.getByRole('button',{name:'Edit Levada walk'}).click();
 await sheet(page).getByLabel('What is it?').fill('Levada hike');await sheet(page).getByLabel('Type').selectOption('activity');
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(page.getByRole('article',{name:'Levada hike'})).toContainText('Everyone (3)');
 await planEvent(page,'Fish dinner','dinner');
 await openSection(page,'People');
 await page.getByRole('button',{name:'Edit Maria'}).click();await sheet(page).getByRole('button',{name:'Remove from trip'}).click();await closed(page);
 await expect(page.getByRole('button',{name:'Edit Maria'})).toHaveCount(0);
 await openSection(page,'Plan');
 await expect(page.getByRole('article',{name:'Levada hike'})).toContainText('Everyone (2)');

 // Shopping: add on a meal and generally, edit, move, mark bought, delete.
 const dinner=page.getByRole('article',{name:'Fish dinner'});
 await dinner.getByLabel('Add to shopping for Fish dinner').fill('Lemon');await dinner.getByLabel('Add to shopping for Fish dinner').press('Enter');
 await page.getByLabel('Add to the list').fill('Sun cream');await page.getByRole('button',{name:'Add item'}).click();
 await expect(page.locator('.shop-group',{hasText:'General'})).toContainText('Sun cream');
 await page.locator('.shop-group',{hasText:'General'}).getByRole('button',{name:'Edit Sun cream'}).click();
 await sheet(page).getByLabel('Item').fill('Sun cream SPF 50');
 const dinnerOption=await sheet(page).getByLabel('For').locator('option',{hasText:'Fish dinner'}).getAttribute('value');
 await sheet(page).getByLabel('For').selectOption(dinnerOption!);await sheet(page).getByLabel('Already bought').check();
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(dinner).toContainText('Sun cream SPF 50');await expect(dinner.locator('.done',{hasText:'Sun cream SPF 50'})).toBeVisible();
 await dinner.getByRole('button',{name:'Edit Lemon'}).click();await sheet(page).getByRole('button',{name:'Delete item'}).click();await closed(page);
 await expect(dinner).not.toContainText('Lemon');

 // Packing: add unassigned, give it to a family with details, filter, pack, delete.
 await openSection(page,'Pack');
 const pack=page.getByRole('region',{name:'Packing list'});
 await page.getByLabel('Add something to bring').fill('Beach tent');await page.getByRole('button',{name:'Add item'}).click();
 await page.getByLabel('Add something to bring').fill('Grill');await page.getByLabel('Who brings it').selectOption({label:'Weber'});await page.getByRole('button',{name:'Add item'}).click();
 await expect(pack.locator('.shop-group',{hasText:'Not decided yet'})).toContainText('Beach tent');
 await expect(pack.locator('.shop-group',{hasText:'Weber'})).toContainText('Grill');
 await page.getByRole('button',{name:'Edit Beach tent'}).click();
 await sheet(page).getByLabel('How many').fill('2');await sheet(page).getByLabel('Who brings it').selectOption({label:'Costa'});await sheet(page).getByLabel('Note (optional)').fill('The blue one');
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(pack.locator('.shop-group',{hasText:'Costa'})).toContainText('2 × Beach tent');await expect(pack.locator('.shop-group',{hasText:'Costa'})).toContainText('The blue one');
 await pack.locator('.filter-chips').getByRole('button',{name:'Weber'}).click();
 await expect(pack.locator('.shop-group')).toHaveCount(1);await expect(pack.locator('.shop-group')).toContainText('Grill');
 await pack.locator('.filter-chips').getByRole('button',{name:'Everything'}).click();
 await pack.locator('.shop-row',{hasText:'Grill'}).getByRole('checkbox').click();
 await expect(page.getByText('1 of 2 packed')).toBeVisible();
 // Transport: a car with a suggested name, a flight, items travelling in them, grouping, removal.
 await pack.getByRole('button',{name:'Add car or flight'}).click();
 await sheet(page).getByLabel('Whose (optional)').selectOption({label:'Costa'});
 await expect(sheet(page).getByLabel('Name')).toHaveValue('Costa car');
 await sheet(page).getByRole('button',{name:'Add',exact:true}).click();await closed(page);
 await pack.getByRole('button',{name:'Add car or flight'}).click();
 await sheet(page).getByLabel('Type').selectOption('plane');await sheet(page).getByLabel('Whose (optional)').selectOption({label:'Weber'});
 await expect(sheet(page).getByLabel('Name')).toHaveValue('Weber plane');
 await sheet(page).getByRole('button',{name:'Add',exact:true}).click();await closed(page);
 await pack.getByRole('button',{name:'Edit Beach tent'}).click();await sheet(page).getByLabel('Travels in (optional)').selectOption({label:'Costa car'});await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await page.getByLabel('Add something to bring').fill('Snorkels');await page.getByLabel('Travels in (optional)').first().selectOption({label:'Weber plane'});await page.getByRole('button',{name:'Add item'}).click();
 await pack.getByRole('button',{name:'By transport'}).click();
 await expect(pack.locator('.shop-group',{hasText:'Costa car'})).toContainText('Beach tent');
 await expect(pack.locator('.shop-group',{hasText:'Weber plane'})).toContainText('Snorkels');
 await expect(pack.getByRole('button',{name:'Edit Costa car'})).toContainText('1');
 await pack.getByRole('button',{name:'Edit Costa car'}).click();await sheet(page).getByRole('button',{name:'Remove'}).click();await closed(page);
 await expect(pack.getByRole('button',{name:'Edit Costa car'})).toHaveCount(0);
 await expect(pack.locator('.shop-group',{hasText:'No transport yet'})).toContainText('Beach tent');
 await pack.getByRole('button',{name:'By family'}).click();
 await page.getByRole('button',{name:'Edit Grill'}).click();await sheet(page).getByRole('button',{name:'Delete item'}).click();await closed(page);
 await expect(pack.locator('.shop-row',{hasText:'Grill'})).toHaveCount(0);

 // Expenses: add, open, edit, void, find in voided, restore.
 await openSection(page,'Spend');
 const quick=page.locator('#quick-expense');
 await quick.getByLabel('What was it?').fill('Fish market');await quick.getByLabel('Amount in EUR').fill('40');
 await quick.getByLabel('Paid by').selectOption({label:'Costa'});
 const forOption=await quick.getByLabel('For').locator('option',{hasText:'Fish dinner'}).getAttribute('value');await quick.getByLabel('For').selectOption(forOption!);
 await quick.getByRole('button',{name:'Save expense'}).click();
 await page.getByRole('button',{name:'Open Fish market'}).click();
 await expect(sheet(page)).toContainText('€40.00');await expect(sheet(page)).toContainText('Who pays what');
 await sheet(page).getByRole('button',{name:'Edit'}).click();
 await sheet(page).getByLabel('What was it?').fill('Fish market Funchal');await sheet(page).getByLabel('Amount in EUR').fill('44.50');await sheet(page).getByLabel('Paid by').selectOption({label:'Weber'});
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(page.getByRole('button',{name:'Open Fish market Funchal'})).toContainText('€44.50');
 await expect(page.getByRole('button',{name:'Open Fish market Funchal'})).toContainText('Weber paid');
 await page.getByRole('button',{name:'Open Fish market Funchal'}).click();await sheet(page).getByRole('button',{name:'Void expense'}).click();await closed(page);
 await expect(page.getByRole('button',{name:'Open Fish market Funchal'})).toHaveCount(0);
 await page.getByRole('button',{name:/Show voided expenses \(1\)/}).click();
 await page.getByRole('button',{name:'Open Fish market Funchal'}).click();await sheet(page).getByRole('button',{name:'Restore expense'}).click();await closed(page);
 await expect(page.getByRole('button',{name:'Open Fish market Funchal'})).not.toHaveClass(/voided/);
 // A plan with an expense on it explains why it cannot be deleted.
 await openSection(page,'Plan');
 await page.getByRole('button',{name:'Edit Fish dinner'}).click();await expect(sheet(page)).toContainText('cannot be deleted');await expect(sheet(page).getByRole('button',{name:'Delete'})).toHaveCount(0);await sheet(page).getByRole('button',{name:'Close'}).click();
 await page.getByRole('button',{name:'Edit Levada hike'}).click();await sheet(page).getByRole('button',{name:'Delete'}).click();await closed(page);
 await expect(page.getByRole('article',{name:'Levada hike'})).toHaveCount(0);

 // Repayments: mark a suggestion paid, edit it, delete it.
 await openSection(page,'Settle');
 await page.getByRole('button',{name:/Mark Costa to Weber as paid/}).click();
 await expect(sheet(page).getByLabel('Amount in EUR')).not.toHaveValue('');
 await sheet(page).getByRole('button',{name:'Record payment'}).click();await closed(page);
 await expect(page.locator('.balance-banner')).toContainText('Everyone is settled.');
 await page.getByRole('button',{name:/Edit repayment from Costa to Weber/}).click();
 await sheet(page).getByLabel('Amount in EUR').fill('10');await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(page.locator('.list-row',{hasText:'Costa paid Weber'})).toContainText('€10.00');
 await page.getByRole('button',{name:/Edit repayment from Costa to Weber/}).click();await sheet(page).getByRole('button',{name:'Delete repayment'}).click();await closed(page);
 await expect(page.getByText('No repayments recorded yet.')).toBeVisible();

 // Access: invite via a person, promote, demote, revoke.
 await openSection(page,'People');
 const guest=`guest-${testInfo.project.name}-${Date.now()}@splitfairy.test`;
 await page.getByRole('button',{name:'Edit Rui'}).click();await sheet(page).getByLabel('Email (optional)').fill(guest);await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect.poll(()=>mailsTo(guest).length,{message:'invitation email'}).toBe(1);
 const row=page.locator('.member-row',{hasText:guest});
 await row.getByRole('button',{name:'Make organizer'}).click();await expect(row).toContainText('Organizer');
 await row.getByRole('button',{name:'Make member'}).click();await expect(row).toContainText('Member');
 await row.getByRole('button',{name:'Remove access'}).click();await expect(page.locator('.member-row',{hasText:guest})).toHaveCount(0);

 // Archive makes the trip read-only and moves it to the archive; unarchive brings it back.
 await page.getByRole('button',{name:'Edit trip'}).click();await sheet(page).getByRole('button',{name:'Archive trip'}).click();await closed(page);
 await expect(page.getByText('This trip is archived and read-only.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Add new'})).toHaveCount(0);
 await toTripList(page);await expect(page.locator('.trip-grid.archived')).toContainText(renamed);
 await switchTrip(page,renamed);await openSection(page,'People');
 await page.getByRole('button',{name:'Edit trip'}).click();await sheet(page).getByRole('button',{name:'Unarchive trip'}).click();await closed(page);
 await expect(page.getByText('This trip is archived and read-only.')).toHaveCount(0);
 // With money in it the trip can only be archived; an empty trip can be deleted.
 await page.getByRole('button',{name:'Edit trip'}).click();await expect(sheet(page)).toContainText('can only be archived');await sheet(page).getByRole('button',{name:'Close'}).click();
 await toTripList(page);
 const empty=unique(testInfo,'Empty');await createTrip(page,empty,iso(30),iso(31));
 await openSection(page,'People');await page.getByRole('button',{name:'Edit trip'}).click();await sheet(page).getByRole('button',{name:'Delete trip'}).click();
 await expect(page.getByText('Every shared trip')).toBeVisible();await expect(page.getByRole('button',{name:new RegExp(empty)})).toHaveCount(0);

 // Signing out ends the session on the server, not just in the browser.
 const cookie=(await page.context().cookies()).find(c=>c.name==='splitfairy_session')!.value;
 await page.locator('.account-row').getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByRole('heading',{name:/Good trips are/i})).toBeVisible();
 const me=await page.request.get('/api/v1/me',{headers:{cookie:`splitfairy_session=${cookie}`}});
 expect(await me.json()).toBeNull();
});
