import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StringInputDialog } from './string-input-dialog';

describe('StringInputDialog', () => {
  let component: StringInputDialog;
  let fixture: ComponentFixture<StringInputDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StringInputDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StringInputDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
