import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProfilesSidebar } from './profiles-sidebar';

describe('ProfilesSidebar', () => {
  let component: ProfilesSidebar;
  let fixture: ComponentFixture<ProfilesSidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilesSidebar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProfilesSidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
