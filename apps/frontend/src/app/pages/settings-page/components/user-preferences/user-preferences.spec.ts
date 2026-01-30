import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserPreferences } from './user-preferences';

describe('UserPreferences', () => {
  let component: UserPreferences;
  let fixture: ComponentFixture<UserPreferences>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserPreferences]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserPreferences);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
