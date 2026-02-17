import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowNodeComponent } from './workflow-node';

describe('WorkflowNodeComponent', () => {
  let component: WorkflowNodeComponent;
  let fixture: ComponentFixture<WorkflowNodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowNodeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkflowNodeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
